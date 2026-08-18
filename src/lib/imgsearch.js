/**
 * Deep scan - reverse image search + AI scrutiny.
 *
 *   .scan (reply to a photo)  ->  where this picture appears online,
 *                                 profile/page links grouped by platform,
 *                                 plus an AI description of what is in it.
 *
 * Engines (all tried, results merged - any one can be down without killing
 * the scan):
 *   1. Google Lens   keyless, unofficial upload endpoint - best general web
 *   2. Yandex Images keyless, unofficial upload endpoint - best at finding
 *                    pages/social posts that reuse a photo
 *   3. SauceNAO      free official API key (200/day) - anime/art sources and
 *                    author profiles (Pixiv, X, ...)
 *
 * AI scrutiny rides the existing Gemini key (src/builtin-keys.js): it names
 * the people type, reads on-screen text and flags landmarks so the report
 * says something about the photo itself, not just where it was found.
 *
 * Honesty baked in: reverse search only finds PUBLIC pages that search
 * engines indexed. No legitimate API can look inside private Facebook or
 * TikTok accounts, and the report says so instead of pretending.
 */
import FormData from 'form-data'
import { http } from './api.js'
import { getKey } from './ai.js'
import { builtinKey } from '../builtin-keys.js'

/* Overridable so tests never touch the real internet. */
const LENS_BASE = process.env.SCAN_LENS_BASE || 'https://lens.google.com'
const YANDEX_BASE = process.env.SCAN_YANDEX_BASE || 'https://yandex.com'
const SAUCENAO_BASE = process.env.SCAN_SAUCENAO_BASE || 'https://saucenao.com'
const GEMINI_BASE = process.env.SCAN_GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_MODEL = process.env.SCAN_GEMINI_MODEL || 'gemini-2.5-flash'

/** Largest picture we upload anywhere. */
export const MAX_INPUT_BYTES = 8 * 1024 * 1024

/* ------------------------ platform classifier ------------------------ */

/**
 * URL -> platform. Order matters (specific hosts before generic ones).
 * Returns null for anything that is not a recognised social platform.
 */
const PLATFORM_RULES = [
  { platform: 'Facebook', match: /(^|\.)facebook\.com|(^|\.)fb\.com|(^|\.)fb\.watch/i, profile: /facebook\.com\/(?!pages\/|groups\/|watch|share|login|photo|video)[A-Za-z0-9._-]{3,}/i },
  { platform: 'Instagram', match: /(^|\.)instagram\.com|(^|\.)instagr\.am/i, profile: /instagram\.com\/(?!p\/|reel\/|stories\/|explore)[A-Za-z0-9._]{2,}/i },
  { platform: 'TikTok', match: /(^|\.)tiktok\.com/i, profile: /tiktok\.com\/@[\w.]+/i },
  { platform: 'X / Twitter', match: /(^|\.)twitter\.com|(^|\.)x\.com/i, profile: /(?:twitter|x)\.com\/(?!search|home|intent|hashtag|i\/)[A-Za-z0-9_]{2,}/i },
  { platform: 'Pinterest', match: /(^|\.)pinterest\.[a-z.]+/i },
  { platform: 'LinkedIn', match: /(^|\.)linkedin\.com/i, profile: /linkedin\.com\/(?:in|company)\/[\w-]+/i },
  { platform: 'YouTube', match: /(^|\.)youtube\.com|(^|\.)youtu\.be/i },
  { platform: 'VK', match: /(^|\.)vk\.com/i },
  { platform: 'Threads', match: /(^|\.)threads\.net/i, profile: /threads\.net\/@[A-Za-z0-9._]+/i },
  { platform: 'Snapchat', match: /(^|\.)snapchat\.com/i },
  { platform: 'Telegram', match: /(^|\.)t\.me|(^|\.)telegram\.me/i },
  { platform: 'WhatsApp', match: /(^|\.)wa\.me|(^|\.)whatsapp\.com/i },
  { platform: 'Reddit', match: /(^|\.)reddit\.com/i },
  { platform: 'Tumblr', match: /(^|\.)tumblr\.com/i },
  { platform: 'Flickr', match: /(^|\.)flickr\.com/i },
  { platform: 'Weibo', match: /(^|\.)weibo\.com/i }
]

export function classifyUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.replace(/^www\./, '')
  const full = `${host}${url.pathname}`
  for (const rule of PLATFORM_RULES) {
    if (rule.match.test(host)) {
      return {
        platform: rule.platform,
        url: url.href,
        isProfile: Boolean(rule.profile && rule.profile.test(full))
      }
    }
  }
  return null
}

/** Junk domains that reverse-search pages always drag in. */
const NOISE = /google\.|yandex|bing\.com|gstatic|schema\.org|w3\.org/i

/** Merge engine hits -> deduped list, social platforms first, profiles on top. */
export function consolidate(hits) {
  const seen = new Set()
  const out = []
  for (const h of hits) {
    const url = String(h.url || '').split('#')[0]
    if (!url || NOISE.test(url)) continue
    // normalise so www./non-www and trailing slashes dedupe together
    let key
    try {
      const u = new URL(url)
      key = `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
    } catch {
      key = url.toLowerCase()
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ url, title: h.title || '', engine: h.engine || '?' })
  }
  const social = out.map((h) => ({ ...h, social: classifyUrl(h.url) })).filter((h) => h.social)
  const other = out.filter((h) => !classifyUrl(h.url)).slice(0, 6)
  social.sort((a, b) => (b.social.isProfile ? 1 : 0) - (a.social.isProfile ? 1 : 0))
  return { social: social.slice(0, 12), other }
}

/* ------------------------------ engines ------------------------------ */

/** Extract candidate result URLs from a messy HTML/JSON blob. */
export function extractUrls(text, limit = 40) {
  const urls = new Set()
  const re = /https?:\/\/[^\s"'<>\\)\]]+/g
  let m
  while ((m = re.exec(text)) && urls.size < limit * 3) urls.add(m[0])
  return [...urls].slice(0, limit * 3)
}

async function lensSearch(buffer) {
  const form = new FormData()
  form.append('encoded_image', buffer, { filename: 'scan.jpg', contentType: 'image/jpeg' })
  const res = await http.post(`${LENS_BASE}/v3/upload`, form, {
    headers: form.getHeaders(),
    timeout: 45_000,
    responseType: 'text',
    validateStatus: () => true
  })
  if (res.status >= 400) throw new Error(`Google Lens HTTP ${res.status}`)
  const text = String(res.data || '')
  return extractUrls(text)
    .map((url) => ({ url, engine: 'Google Lens' }))
    .filter((h) => classifyUrl(h.url) || !NOISE.test(h.url))
    .slice(0, 20)
}

async function yandexSearch(buffer) {
  const form = new FormData()
  form.append('image', buffer, { filename: 'scan.jpg', contentType: 'image/jpeg' })
  const res = await http.post(`${YANDEX_BASE}/images/search`, form, {
    headers: { ...form.getHeaders(), referer: `${YANDEX_BASE}/images/` },
    params: { rpt: 'imageview' },
    timeout: 45_000,
    responseType: 'text',
    validateStatus: () => true
  })
  if (res.status >= 400) throw new Error(`Yandex HTTP ${res.status}`)
  const text = String(res.data || '')
  // Yandex embeds a JSON "sites" list for exact matches - prefer those.
  const sites = []
  const siteRe = /"url":"(https?:[^"]+)","title":"([^"]*)"/g
  let sm
  while ((sm = siteRe.exec(text))) sites.push({ url: sm[1].replace(/\\u002F/g, '/'), title: sm[2], engine: 'Yandex' })
  if (sites.length) return sites.slice(0, 20)
  return extractUrls(text)
    .map((url) => ({ url, engine: 'Yandex' }))
    .filter((h) => classifyUrl(h.url))
    .slice(0, 20)
}

async function saucenaoSearch(buffer) {
  const key = (process.env.SAUCENAO_API_KEY || builtinKey('SAUCENAO_API_KEY') || '').trim()
  if (!key) return [] // optional engine - no key, no drama
  const form = new FormData()
  form.append('file', buffer, { filename: 'scan.jpg', contentType: 'image/jpeg' })
  const res = await http.post(`${SAUCENAO_BASE}/search.php`, form, {
    headers: form.getHeaders(),
    params: { db: 999, output_type: 2, numres: 8, api_key: key },
    timeout: 45_000,
    validateStatus: () => true
  })
  const data = res.data
  if (res.status >= 400 || data?.header?.status !== 0) {
    throw new Error(`SauceNAO: ${data?.header?.message || `HTTP ${res.status}`}`)
  }
  return (data?.results || [])
    .flatMap((r) => (r.data?.ext_urls || []).map((url) => ({ url, title: r.data?.title || r.data?.member_name || '', engine: 'SauceNAO' })))
    .slice(0, 12)
}

/* ---------------------------- AI scrutiny ---------------------------- */

/**
 * Gemini vision pass: what is actually in the picture. Returns '' when no
 * Gemini key is configured - the scan still works, just without commentary.
 */
export async function scrutinize(buffer) {
  const key = getKey('gemini')
  if (!key) return ''
  const prompt =
    'Examine this image closely for a fact-check style report. In 5 short bullet lines say: ' +
    '(1) the main subject and setting, (2) any readable text in the image, ' +
    '(3) whether it looks like a profile photo / selfie / screenshot / product / artwork, ' +
    '(4) any recognisable landmark, brand or public figure, ' +
    '(5) one search hint that would help find its source. ' +
    'Plain text bullets, no markdown, no speculation beyond what is visible.'
  try {
    const { data } = await http.post(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } }
            ]
          }
        ],
        generationConfig: { maxOutputTokens: 400, temperature: 0.2 }
      },
      { headers: { 'x-goog-api-key': key }, timeout: 60_000 }
    )
    const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
    return out.trim()
  } catch {
    return '' // scrutiny is a bonus - never fail the scan over it
  }
}

/* ----------------------------- main entry ----------------------------- */

/**
 * Deep-scan a photo. Returns { analysis, social, other, engines }.
 * Every engine fails independently; only when NOTHING answers do we throw.
 */
export async function deepScan(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) throw new Error('that does not look like an image')
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('image is over 8MB - send a smaller photo')

  const engines = [
    { name: 'Google Lens', run: lensSearch },
    { name: 'Yandex', run: yandexSearch },
    { name: 'SauceNAO', run: saucenaoSearch }
  ]

  const settled = await Promise.allSettled(engines.map((e) => e.run(buffer)))
  const hits = []
  const alive = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled' && s.value.length) {
      hits.push(...s.value)
      alive.push(engines[i].name)
    }
  })

  const analysisPromise = scrutinize(buffer)
  const { social, other } = consolidate(hits)
  const analysis = await analysisPromise

  if (!alive.length) {
    throw new Error(
      'every reverse-search engine is unreachable right now (Google Lens, Yandex and SauceNAO all failed). Try again in a minute.'
    )
  }
  return { analysis, social, other, engines: alive, total: hits.length }
}

export default { deepScan, scrutinize, consolidate, classifyUrl, extractUrls }

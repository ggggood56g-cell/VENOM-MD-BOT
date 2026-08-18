/**
 * Background removal - cut a subject out of any photo, transparent PNG out.
 *
 *   .removebg            reply to an image -> transparent PNG
 *   .removebg white      ...or drop the subject on a solid colour
 *
 * Providers (tried in order, first one with a key wins, failover on error):
 *   1. remove.bg   https://www.remove.bg/api      gold standard, 50 free/mo
 *   2. Photoroom   https://www.photoroom.com/api  great edges, cheap credits
 *   3. Slazzer     https://www.slazzer.com/api    remove.bg-compatible
 *
 * Key precedence - same convention as the AI providers and .predkey:
 *   1. .env / panel environment   (a deployer's own key always wins)
 *   2. .rbgkey from WhatsApp      (stored in the database)
 *   3. src/builtin-keys.js        (the public key that ships with the code)
 */
import FormData from 'form-data'
import { http } from './api.js'
import DB from './database.js'
import { builtinKey } from '../builtin-keys.js'

export const RBG_PROVIDERS = {
  removebg: {
    label: 'remove.bg',
    env: 'REMOVEBG_API_KEY',
    url: 'https://api.remove.bg/v1.0/removebg',
    header: 'X-Api-Key',
    signup: 'https://www.remove.bg/api'
  },
  photoroom: {
    label: 'Photoroom',
    env: 'PHOTOROOM_API_KEY',
    url: 'https://sdk.photoroom.com/v1/segment',
    header: 'x-api-key',
    signup: 'https://www.photoroom.com/api'
  },
  slazzer: {
    label: 'Slazzer',
    env: 'SLAZZER_API_KEY',
    url: 'https://api.slazzer.com/v3.0/removebg',
    header: 'X-API-KEY',
    signup: 'https://www.slazzer.com/api'
  }
}

/** Largest photo we upload - bigger ones are rejected with a hint. */
export const MAX_INPUT_BYTES = 9 * 1024 * 1024

/* ------------------------------ keys ------------------------------ */

/** Resolve one provider key: env > database (.rbgkey) > built-in. */
export async function resolveRbgKey(envName) {
  const env = String(process.env[envName] || '').trim()
  if (env) return env
  try {
    const row = await DB.vars.findOne({ key: envName })
    if (row?.value) return String(row.value).trim()
  } catch {
    /* db unreachable - built-in still works */
  }
  return builtinKey(envName)
}

/** Every provider that currently has a usable key, chain order. */
export async function rbgAvailable() {
  const out = []
  for (const [name, p] of Object.entries(RBG_PROVIDERS)) {
    if (await resolveRbgKey(p.env)) out.push(name)
  }
  return out
}

export async function setRbgKey(provider, value) {
  const p = RBG_PROVIDERS[provider]
  if (!p) throw new Error(`Unknown provider: ${provider}`)
  const v = String(value || '').trim()
  if (!v) {
    await DB.vars.delete({ key: p.env })
    return
  }
  await DB.vars.set({ key: p.env }, { value: v })
}

/* ----------------------------- engine ----------------------------- */

async function callProvider(name, p, key, imageBuffer) {
  const form = new FormData()
  form.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' })
  if (name === 'removebg') form.append('size', 'auto') // full resolution, not preview

  const res = await http.post(p.url, form, {
    headers: { [p.header]: key, ...form.getHeaders() },
    timeout: 60_000,
    responseType: 'arraybuffer',
    // providers return JSON errors with non-2xx codes; keep the body
    validateStatus: () => true
  })

  const body = Buffer.from(res.data)
  const ct = String(res.headers['content-type'] || '')

  if (res.status >= 200 && res.status < 300 && ct.includes('image')) return body

  // error body is JSON - surface the real reason (bad key, out of credits...)
  let why = `HTTP ${res.status}`
  try {
    const j = JSON.parse(body.toString('utf-8'))
    why = j?.errors?.[0]?.title || j?.errors?.[0]?.detail || j?.error || j?.message || why
  } catch {}
  throw new Error(`${p.label}: ${why}`)
}

/**
 * Remove the background from an image buffer.
 * Returns { buffer, provider } - a PNG with transparency.
 * Throws a friendly error when no provider is configured or all fail.
 */
export async function removeBackground(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 100) {
    throw new Error('that does not look like an image')
  }
  if (imageBuffer.length > MAX_INPUT_BYTES) {
    throw new Error('image is over 9MB - send a smaller photo')
  }

  const failures = []
  for (const [name, p] of Object.entries(RBG_PROVIDERS)) {
    const key = await resolveRbgKey(p.env)
    if (!key) continue
    try {
      const buffer = await callProvider(name, p, key, imageBuffer)
      return { buffer, provider: p.label }
    } catch (e) {
      failures.push(e.message)
    }
  }

  if (!failures.length) {
    throw new Error(
      'background removal has no API key yet.\n\n' +
        'Owner: get a free key and send it to me:\n' +
        '• remove.bg (50 free/mo): https://www.remove.bg/api\n' +
        '   *.rbgkey removebg <key>*\n' +
        '• Photoroom: https://www.photoroom.com/api\n' +
        '   *.rbgkey photoroom <key>*'
    )
  }
  throw new Error(`every background-removal provider failed:\n${failures.map((f) => `• ${f}`).join('\n')}`)
}

export default { removeBackground, resolveRbgKey, setRbgKey, rbgAvailable, RBG_PROVIDERS }

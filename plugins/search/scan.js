import { deepScan } from '../../src/lib/imgsearch.js'

/**
 * Deep scan - send a picture, get the dossier.
 *
 *   .scan (reply to an image, or .scan as the photo caption)
 *
 * The bot reverse-searches the photo across Google Lens, Yandex and
 * SauceNAO, groups every hit by platform (Facebook, TikTok, Instagram,
 * X, Pinterest, VK...) with profile pages first, and adds an AI
 * description of what the picture actually shows. Engine in
 * src/lib/imgsearch.js - all keyless except optional SAUCENAO_API_KEY.
 */

const EMOJI = {
  Facebook: '📘', Instagram: '📸', TikTok: '🎵', 'X / Twitter': '🐦',
  Pinterest: '📌', LinkedIn: '💼', YouTube: '▶️', VK: '🔵', Threads: '🧵',
  Snapchat: '👻', Telegram: '✈️', WhatsApp: '💬', Reddit: '🤖',
  Tumblr: '🎨', Flickr: '📷', Weibo: '🌏'
}

function renderReport(res, prefix) {
  const lines = [`🔎 *DEEP SCAN REPORT*`, '']

  if (res.analysis) {
    lines.push('🧠 *What the picture shows*', res.analysis, '')
  }

  if (res.social.length) {
    lines.push('🌐 *Where this picture appears on social platforms*')
    let current = null
    for (const hit of res.social) {
      const { platform, url, isProfile } = hit.social
      if (platform !== current) {
        lines.push(`${EMOJI[platform] || '🔗'} *${platform}*`)
        current = platform
      }
      lines.push(`${isProfile ? '👤' : '•'} ${url}${hit.title ? ` — _${hit.title}_` : ''}`)
    }
    lines.push('')
  }

  if (res.other.length) {
    lines.push('🔗 *Also found on the open web*')
    for (const hit of res.other) lines.push(`• ${hit.url}`)
    lines.push('')
  }

  if (!res.social.length && !res.other.length) {
    lines.push(
      '🤷 *No matches found.* This picture does not appear on any page the search engines know about - it may be brand new, private, or never posted publicly.',
      ''
    )
  }

  lines.push(
    `📡 Engines: ${res.engines.join(' + ')} · ${res.total} raw hits`,
    '',
    `⚠️ _Deep scan only finds PUBLIC pages that search engines indexed. Private accounts (locked Facebook/TikTok/Instagram profiles) are invisible to every legitimate search tool - anyone claiming otherwise is lying._`,
    `💡 Tip: try *${prefix}scan* on a cropped face or the clearest version of the photo for better hits.`
  )
  return lines.join('\n')
}

export default {
  name: 'scan',
  alias: ['findpic', 'searchpic', 'reverseimg', 'trace', 'source', 'deepsearch', 'findsource'],
  category: 'SEARCH',
  desc: 'Deep-scan a photo: where it appears online + social profile links + AI analysis',
  usage: '.scan (reply to an image, or caption the photo with .scan)',
  cooldown: 20,

  async run({ m, prefix }) {
    const src = m.type === 'imageMessage' ? m : m.quoted?.type === 'imageMessage' ? m.quoted : null
    if (!src) {
      return m.reply(
        `🔎 Send me the picture with *${prefix}scan* as its caption,\n` +
        `or reply to a photo with *${prefix}scan*.\n\n` +
        `_I will hunt for where it appears online - social pages, profiles and sources._`
      )
    }

    await m.react('🔎')
    try {
      const photo = await src.download()
      const res = await deepScan(photo)
      await m.reply(renderReport(res, prefix))
      await m.react(res.social.length || res.other.length ? '✅' : '🤷')
    } catch (e) {
      await m.react('❌')
      await m.reply(`🔎 ${e.message}`)
    }
  }
}

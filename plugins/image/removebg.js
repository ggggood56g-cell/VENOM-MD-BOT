import sharp from 'sharp'
import { removeBackground, rbgAvailable, setRbgKey, resolveRbgKey, RBG_PROVIDERS } from '../../src/lib/removebg.js'

/**
 * Background remover - the standard cutout command every big bot has.
 *
 *   .removebg            reply to an image -> transparent PNG
 *   .removebg white      ...or drop the subject on a solid colour
 *   .removebg #1a4d2e    any hex colour works too
 *
 * The engine (src/lib/removebg.js) fails over across remove.bg, Photoroom
 * and Slazzer; keys come from .env, .rbgkey or src/builtin-keys.js, so the
 * public key shipped with the code works for every deployer.
 */

const NAMED_COLOURS = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#00aa00',
  blue: '#0000ff',
  yellow: '#ffff00',
  grey: '#808080',
  gray: '#808080'
}

const parseBg = (word) => {
  if (!word) return null
  const w = word.trim().toLowerCase()
  if (NAMED_COLOURS[w]) return NAMED_COLOURS[w]
  if (/^#?[0-9a-f]{6}$/i.test(w)) return w.startsWith('#') ? w : `#${w}`
  return undefined // asked for a colour but not one we understand
}

export default [
  {
    name: 'removebg',
    alias: ['rmbg', 'cutout', 'nobg', 'erasebg', 'bgremove'],
    category: 'IMAGE',
    desc: 'Remove the background from a photo (transparent PNG or new colour)',
    usage: '.removebg | .removebg white | .removebg #1a4d2e  (reply to an image)',
    cooldown: 10,

    async run({ m, args }) {
      const src = m.type === 'imageMessage' ? m : m.quoted?.type === 'imageMessage' ? m.quoted : null
      if (!src) return m.reply('✂️ Reply to an image with *.removebg*\n\nWant a solid background? *.removebg white* or *.removebg #1a4d2e*')

      const bg = parseBg(args[0])
      if (bg === undefined) return m.reply(`🎨 I don't know the colour *${args[0]}*.\nTry: white, black, red, blue... or a hex code like #1a4d2e`)

      await m.react('✂️')
      try {
        const photo = await src.download()
        const { buffer: cutout, provider } = await removeBackground(photo)

        let out = cutout
        let note = 'transparent PNG'
        if (bg) {
          out = await sharp(cutout).flatten({ background: bg }).png().toBuffer()
          note = `${args[0].toLowerCase()} background`
        }

        await m.reply({
          image: out,
          caption: `✂️ *Background removed* — ${note}\n🔎 Engine: ${provider}\n\n_Tip: no background = perfect for stickers (.sticker) and DPs._`
        })
        await m.react('✅')
      } catch (e) {
        await m.react('❌')
        await m.reply(`✂️ ${e.message}`)
      }
    }
  },
  {
    name: 'rbgkey',
    category: 'IMAGE',
    desc: 'Set a background-removal API key (owner)',
    usage: '.rbgkey removebg <key> | .rbgkey photoroom <key> | .rbgkey off',
    owner: true,

    async run({ sock, m, args, prefix }) {
      const provider = (args[0] || '').toLowerCase()

      if (!provider) {
        const lines = []
        for (const [name, p] of Object.entries(RBG_PROVIDERS)) {
          const has = !!(await resolveRbgKey(p.env))
          lines.push(`${has ? '🟢' : '⚪'} *${p.label}* — ${has ? 'key set' : 'no key'} (${p.signup.replace('https://', '')})`)
        }
        return m.reply(
          `✂️ *BACKGROUND REMOVER KEYS*\n\n${lines.join('\n')}\n\n` +
            `Set: *${prefix}rbgkey removebg <key>*\nClear all: *${prefix}rbgkey off*\n\n` +
            `_A key set here or in src/builtin-keys.js works for every deployer._`
        )
      }

      if (provider === 'off') {
        for (const name of Object.keys(RBG_PROVIDERS)) await setRbgKey(name, '')
        return m.reply('🗑️ All background-removal keys cleared (built-in keys in the code still apply).')
      }

      if (!RBG_PROVIDERS[provider]) {
        return m.reply(`❌ Unknown provider "${provider}".\n\nValid: ${Object.keys(RBG_PROVIDERS).join(', ')}`)
      }

      const value = args.slice(1).join(' ').trim()
      if (!value) return m.reply(`📝 Usage: *${prefix}rbgkey ${provider} <api key>*\n\nGet one: ${RBG_PROVIDERS[provider].signup}`)

      // wipe the secret from the chat as fast as possible
      await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {})

      await setRbgKey(provider, value)
      const active = await rbgAvailable()
      await m.reply(
        `🔑 *${RBG_PROVIDERS[provider].label}* key saved.\n` +
          `Active chain: ${active.map((n) => RBG_PROVIDERS[n].label).join(' → ') || '(none - check the key)'}`
      )
    }
  }
]

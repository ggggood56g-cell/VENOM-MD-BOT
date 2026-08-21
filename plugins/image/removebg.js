import sharp from 'sharp'
import { removeBackground, resolveRbgKey, RBG_PROVIDERS } from '../../src/lib/removebg.js'

/**
 * Background remover - the standard cutout command every big bot has.
 *
 *   .removebg            reply to an image -> transparent PNG
 *   .removebg white      ...or drop the subject on a solid colour
 *   .removebg #1a4d2e    any hex colour works too
 *
 * The engine (src/lib/removebg.js) fails over across remove.bg, Photoroom
 * and Slazzer. Credentials come only from the private deployment environment.
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

    async run({ sock, m, args }) {
      const provider = (args[0] || '').toLowerCase()
      if (args.length > 1) {
        await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {})
      }

      const lines = []
      for (const [, value] of Object.entries(RBG_PROVIDERS)) {
        const active = !!(await resolveRbgKey(value.env))
        lines.push(
          `${active ? '🟢' : '⚪'} *${value.label}* — ${active ? 'environment key active' : `set ${value.env}`}\n  ${value.signup}`
        )
      }
      if (provider && provider !== 'off' && !RBG_PROVIDERS[provider]) {
        return m.send(`❌ Unknown provider "${provider}".\n\nValid: ${Object.keys(RBG_PROVIDERS).join(', ')}`)
      }
      await m.send(
        `🔒 Background-removal keys cannot be submitted or removed through WhatsApp. Configure them in your private deployment environment and restart VENOM.\n\n${lines.join('\n\n')}`
      )
    }
  }
]

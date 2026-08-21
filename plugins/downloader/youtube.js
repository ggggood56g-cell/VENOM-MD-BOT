import {
  youtubeInfoSmart, youtubeAudioSmart, youtubeVideoSmart, youtubeSearchSmart,
  musicAuto, fmtDuration, fmtCount, hasYtdlp, isUrl
} from '../../src/lib/downloader.js'
import { probeProviders, PROVIDERS } from '../../src/lib/ytapi.js'
import { getVar } from '../../src/lib/vars.js'
import { getBuffer } from '../../src/lib/api.js'

const YT_URL = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/

/** Accept a URL or search phrase and preserve the search metadata as a hint. */
async function resolve(input) {
  if (isUrl(input)) {
    if (!YT_URL.test(input)) throw new Error('That is not a YouTube link.')
    return { url: input, hint: null }
  }
  const [first] = await youtubeSearchSmart(input, 1)
  if (!first) throw new Error(`No YouTube results for "${input}".`)
  return { url: first.url, hint: first }
}

/** Fill metadata gaps without replacing real values returned by YouTube. */
export function mergeYoutubeInfo(info = {}, hint = {}) {
  return {
    ...hint,
    ...info,
    title: info.title || hint.title || '',
    author: info.author || hint.author || '',
    duration: Number(info.duration || hint.duration || 0),
    views: Number(info.views || hint.views || 0),
    thumbnail: info.thumbnail || hint.thumbnail || ''
  }
}

export default [
  {
    name: 'play',
    alias: ['song', 'ytmp3', 'yta', 'ytaudio'],
    category: 'DOWNLOADER',
    desc: 'Download a song from YouTube as audio (auto-falls back to SoundCloud/Audiomack)',
    usage: '.play alan walker faded',
    cooldown: 20,
    async run({ m, text }) {
      if (!text) return m.reply('🎵 Give me a song name or YouTube link:\n*.play alan walker faded*')

      await m.react('⏳')
      let ytTitle = null // kept for the multi-source fallback if YouTube refuses
      try {
        const { url, hint } = await resolve(text)
        const info = mergeYoutubeInfo(await youtubeInfoSmart(url), hint)
        ytTitle = info.title || hint?.title || null

        if (info.duration > 1800) {
          await m.react('❌')
          return m.reply(`⏱️ That track is ${fmtDuration(info.duration)} long. Keep it under 30 minutes.`)
        }

        // send the info card immediately so the user knows it is working
        const caption =
          `╭━━━〔 *YOUTUBE AUDIO* 〕━━━╮\n` +
          `┃ 🎵 ${info.title}\n` +
          `┃ 👤 ${info.author}\n` +
          `┃ ⏱️ ${fmtDuration(info.duration)}\n` +
          `┃ 👁️ ${fmtCount(info.views)} views\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n_Downloading audio..._`

        if (info.thumbnail) {
          await m.reply({ image: await getBuffer(info.thumbnail).catch(() => null), caption }).catch(() => m.reply(caption))
        } else {
          await m.reply(caption)
        }

        const { buffer } = await youtubeAudioSmart(url)
        await m.reply({
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${info.title.replace(/[^\w\s-]/g, '').slice(0, 60)}.mp3`
        })
        await m.react('✅')
      } catch (ytErr) {
        /*
         * YouTube bot-checks server IPs, so this is where .play dies on most
         * hosts. Rather than failing, take the same song to SoundCloud and
         * Audiomack, which don't bot-check. If the user gave a bare link and
         * we never got a title, there's nothing to search elsewhere with.
         */
        // For a name search, the user's words are safer than a weak metadata
        // fallback. For a pasted URL, use the exact title obtained above.
        const query = isUrl(text) ? ytTitle : text
        if (!query) {
          await m.react('❌')
          return m.reply(
            `❌ YouTube failed: ${ytErr.message.split('\n')[0]}\n\n` +
              `_Try the song name instead - *.music <song name>* searches other sources too._`
          )
        }

        await m.reply(`⚠️ YouTube refused that download - searching *SoundCloud* and *Audiomack* instead...`)
        try {
          const r = await musicAuto(query, { order: ['soundcloud', 'audiomack'] })
          const caption =
            `╭━━━〔 *MUSIC* 〔${r.source}〕━━━╮\n` +
            `┃ 🎵 ${r.title}\n` +
            `┃ 👤 ${r.artist}\n` +
            (r.duration ? `┃ ⏱️ ${fmtDuration(r.duration)}\n` : '') +
            `╰━━━━━━━━━━━━━━━━━━━╯\n_Found outside YouTube ✌️_`
          const img = r.image ? await getBuffer(r.image).catch(() => null) : null
          if (img) await m.reply({ image: img, caption }).catch(() => m.reply(caption))
          else await m.reply(caption)

          await m.reply({
            audio: r.buffer,
            mimetype: 'audio/mpeg',
            fileName: `${r.title.replace(/[^\w\s-]/g, '').slice(0, 60)}.mp3`
          })
          await m.react('✅')
        } catch (multiErr) {
          await m.react('❌')
          await m.reply(`❌ YouTube failed: ${ytErr.message.split('\n')[0]}\n\n${multiErr.message}`)
        }
      }
    }
  },
  {
    name: 'video',
    alias: ['ytmp4', 'ytv', 'ytvideo'],
    category: 'DOWNLOADER',
    desc: 'Download a video from YouTube',
    usage: '.video despacito  |  .video <link> 720',
    cooldown: 30,
    async run({ m, text, args, prefix }) {
      if (!text) return m.reply('🎬 Give me a video name or YouTube link:\n*.video despacito*\n\nAdd a quality: *.video <link> 720*')

      // trailing number = requested quality
      const qualities = [144, 240, 360, 480, 720, 1080]
      const last = parseInt(args[args.length - 1])
      const quality = qualities.includes(last) ? last : 360
      const query = qualities.includes(last) ? args.slice(0, -1).join(' ') : text

      await m.react('⏳')
      try {
        const { url, hint } = await resolve(query)
        const info = mergeYoutubeInfo(await youtubeInfoSmart(url), hint)

        if (info.duration > 900) {
          await m.react('❌')
          return m.reply(`⏱️ That video is ${fmtDuration(info.duration)} long. Keep it under 15 minutes, or use *.play* for audio only.`)
        }

        const caption =
          `╭━━━〔 *YOUTUBE VIDEO* 〕━━━╮\n` +
          `┃ 🎬 ${info.title}\n` +
          `┃ 👤 ${info.author}\n` +
          `┃ ⏱️ ${fmtDuration(info.duration)}\n` +
          `┃ 👁️ ${fmtCount(info.views)} views\n` +
          `┃ 📺 Quality: ${quality}p\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n_Downloading video..._`
        await m.reply(caption)

        const { buffer, source } = await youtubeVideoSmart(url, { quality })
        await m.reply({
          video: buffer,
          caption: `🎬 *${info.title}*\n👤 ${info.author}\n📡 via ${source}`,
          fileName: `${info.title.replace(/[^\w\s-]/g, '').slice(0, 60)}.mp4`
        })
        await m.react('✅')
      } catch (e) {
        await m.react('❌')
        /*
         * When YouTube bot-checks the host there is nothing the user can do
         * from chat, so point them at the two commands that still work
         * rather than leaving them at a dead end.
         */
        const blocked = /bot check|not a bot|Sign in to confirm/i.test(e.message)
        await m.reply(
          blocked
            ? `${e.message}\n\n*Meanwhile:*\n` +
              `▸ *${prefix}ytstatus* — see which download services work on this host\n` +
              `▸ *${prefix}movie ${query}* — searches free catalogues\n` +
              `▸ *${prefix}play ${query}* — audio, falls back to SoundCloud`
            : `❌ ${e.message}`
        )
      }
    }
  },
  {
    name: 'ytsearch',
    alias: ['yts', 'searchyt'],
    category: 'DOWNLOADER',
    desc: 'Search YouTube',
    usage: '.ytsearch lofi hip hop',
    cooldown: 10,
    async run({ m, text, prefix }) {
      if (!text) return m.reply('🔎 Usage: .ytsearch lofi hip hop')
      await m.react('🔎')
      try {
        const results = await youtubeSearchSmart(text, 6)
        if (!results.length) return m.reply(`❌ No results for "${text}".`)
        const body = results
          .map((r, i) =>
            `*${i + 1}.* ${r.title}\n` +
            `   👤 ${r.author || 'unknown'}\n` +
            `   ⏱️ ${fmtDuration(r.duration)}  👁️ ${fmtCount(r.views)}\n` +
            `   🔗 ${r.url}`
          )
          .join('\n\n')
        await m.reply(
          `🔎 *YOUTUBE SEARCH*\n_${text}_\n\n${body}\n\n` +
          `💡 Download with *${prefix}play <name>* or *${prefix}video <link>*`
        )
        await m.react('✅')
      } catch (e) {
        await m.react('❌')
        await m.reply(`❌ ${e.message}`)
      }
    }
  },
  {
    name: 'ytinfo',
    category: 'DOWNLOADER',
    desc: 'Show details about a YouTube video',
    usage: '.ytinfo <link>',
    cooldown: 10,
    async run({ m, text }) {
      if (!text) return m.reply('📝 Usage: .ytinfo https://youtu.be/...')
      await m.react('⏳')
      try {
        const { url, hint } = await resolve(text)
        const info = mergeYoutubeInfo(await youtubeInfoSmart(url), hint)
        const date = info.upload ? `${info.upload.slice(6, 8)}/${info.upload.slice(4, 6)}/${info.upload.slice(0, 4)}` : 'unknown'
        const caption =
          `╭━━━〔 *VIDEO INFO* 〕━━━╮\n` +
          `┃ 🎬 ${info.title}\n` +
          `┃ 👤 ${info.author}\n` +
          `┃ ⏱️ ${fmtDuration(info.duration)}\n` +
          `┃ 👁️ ${fmtCount(info.views)} views\n` +
          `┃ 👍 ${fmtCount(info.likes)} likes\n` +
          `┃ 📅 ${date}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n` +
          `📝 ${(info.description || 'No description').slice(0, 500)}`
        if (info.thumbnail) {
          await m.reply({ image: await getBuffer(info.thumbnail), caption })
        } else {
          await m.reply(caption)
        }
        await m.react('✅')
      } catch (e) {
        await m.react('❌')
        await m.reply(`❌ ${e.message}`)
      }
    }
  },
  {
    name: 'ytstatus',
    alias: ['dltest2', 'ytcheck'],
    category: 'DOWNLOADER',
    desc: 'Test every YouTube download route from this host',
    usage: '.ytstatus',
    owner: true,
    cooldown: 30,
    async run({ m, prefix }) {
      await m.react('🔎')
      await m.reply(`🔎 Testing ${PROVIDERS.length} download services from this server...`)

      const results = await probeProviders()
      const ok = results.filter((r) => r.ok)
      const body = results
        .sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms)
        .map((r) => `${r.ok ? '✅' : '❌'} *${r.name}* — ${r.ok ? `${r.ms}ms` : r.error}`)
        .join('\n')

      await m.reply(
        `╭━━━〔 *DOWNLOAD ROUTES* 〕━━━╮\n${body}\n` +
          `┃\n┃ ${hasYtdlp() ? '✅' : '❌'} *yt-dlp* — ${hasYtdlp() ? 'installed' : 'missing (install on host)'}\n` +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
          `📡 Mode: *${getVar('DL_SOURCE')}* · Preferred: *${getVar('DL_PROVIDER')}*\n\n` +
          (ok.length
            ? `*${ok.length}/${results.length} services are alive* — .play and .video should work.\n\n` +
              `Pin the fastest one: *${prefix}setvar DL_PROVIDER ${ok[0]?.name}*`
            : `⚠️ *Every service failed.* Either this host blocks outbound requests, or all the free APIs are down at once (it happens).\n\n` +
              `Install yt-dlp on the host, then try: *${prefix}setvar DL_SOURCE ytdlp*.`)
      )
      await m.react('✅')
    }
  }
]

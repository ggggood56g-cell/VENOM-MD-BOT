/** Regression tests for the August 2026 YouTube player-client breakage. */
import './_isolate.js'
import { YT_CLIENTS } from '../src/lib/downloader.js'
import { mergeYoutubeInfo } from '../plugins/downloader/youtube.js'

const hint = {
  id: 'uJ_1HMAGb4k',
  title: 'Twenty One Pilots - Stressed Out (Official Video)',
  author: 'Fueled By Ramen',
  duration: 202,
  views: 3_000_000_000,
  url: 'https://www.youtube.com/watch?v=uJ_1HMAGb4k'
}

const merged = mergeYoutubeInfo({
  id: hint.id,
  title: '',
  author: '',
  duration: 0,
  views: 0,
  thumbnail: `https://i.ytimg.com/vi/${hint.id}/hqdefault.jpg`,
  url: hint.url
}, hint)

const authoritative = mergeYoutubeInfo({
  ...hint,
  title: 'Exact title from YouTube oEmbed',
  author: 'Exact channel'
}, hint)

const checks = [
  ['visionOS replaces the blocked android_vr first route', YT_CLIENTS[0] === 'visionos'],
  ['blocked android_vr is no longer forced', !YT_CLIENTS.includes('android_vr')],
  ['search title survives a metadata outage', merged.title === hint.title],
  ['search artist survives a metadata outage', merged.author === hint.author],
  ['search duration survives a metadata outage', merged.duration === hint.duration],
  ['authoritative YouTube metadata wins when available', authoritative.title === 'Exact title from YouTube oEmbed']
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failed++
}
console.log(`\n═══ ${checks.length - failed} passed, ${failed} failed ═══`)
process.exit(failed ? 1 : 0)

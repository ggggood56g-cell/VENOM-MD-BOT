/**
 * Regression tests for WhatsApp's PN/LID dual addressing in group metadata.
 * A bot listed as an admin by @lid must not be rejected as a non-admin.
 */
import './_isolate.js'
import { serialize, resolvePermissions } from '../src/lib/serialize.js'

const GROUP = '120363111222333444@g.us'
const BOT_PN = '2348000000000@s.whatsapp.net'
const BOT_LID = '987654321000111@lid'
const USER_PN = '2348111111111@s.whatsapp.net'
const USER_LID = '123456789000111@lid'

const raw = {
  key: {
    id: 'LID-TEST',
    remoteJid: GROUP,
    participant: USER_LID,
    participantAlt: USER_PN,
    fromMe: false
  },
  pushName: 'Admin',
  messageTimestamp: Math.floor(Date.now() / 1000),
  message: { conversation: '.kick @user' }
}

const metadata = {
  id: GROUP,
  subject: 'LID Group',
  owner: USER_LID,
  participants: [
    { id: USER_LID, phoneNumber: USER_PN, admin: 'superadmin' },
    { id: BOT_LID, phoneNumber: BOT_PN, admin: 'admin' }
  ]
}

const makeSock = (includeBotLid = true) => ({
  user: { id: BOT_PN, ...(includeBotLid ? { lid: BOT_LID } : {}) },
  groupMetadata: async () => metadata,
  sendMessage: async () => ({ key: { id: 'reply' } })
})

const sock = makeSock(true)
const m = await serialize(sock, raw)
await resolvePermissions(sock, m)

// Also cover sessions where creds do not yet expose `me.lid`: metadata's
// phoneNumber alias must still identify the bot correctly.
const noLidSock = makeSock(false)
const noLidMessage = await serialize(noLidSock, raw)
await resolvePermissions(noLidSock, noLidMessage)

// A warm group cache must avoid another WhatsApp metadata request.
let metadataCalls = 0
const cachedSock = {
  ...makeSock(true),
  groupMetadata: async () => {
    metadataCalls++
    return metadata
  }
}
const cachedMessage = await serialize(cachedSock, raw)
const groupCache = new Map([[GROUP, metadata]])
await resolvePermissions(cachedSock, cachedMessage, [], groupCache)

const checks = [
  ['sender phone number comes from participantAlt', m.senderNumber === '2348111111111'],
  ['LID-addressed command sender is recognised as admin', m.isAdmin === true],
  ['bot LID is recognised as the same admin account', m.isBotAdmin === true],
  ['metadata phoneNumber works when bot LID is unavailable', noLidMessage.isBotAdmin === true],
  ['warm group metadata cache avoids a network call', metadataCalls === 0 && cachedMessage.isBotAdmin]
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failed++
}
console.log(`\n═══ ${checks.length - failed} passed, ${failed} failed ═══`)
process.exit(failed ? 1 : 0)

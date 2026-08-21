/**
 * Offline regression test for resolving a pinned School/support group when
 * WhatsApp rejects groupGetInviteInfo even though the bot is already admin.
 *
 *   node test/school-group-test.mjs
 */
import './_isolate.js'
import config from '../src/config.js'
import { attachSchool, classroom, parseInviteCode } from '../src/lib/school.js'

const LINK = 'https://chat.whatsapp.com/LdO0VcRmIdF0JmZ6z5SyOW?s=cl&p=a&mlu=0&ilr=0'
const CODE = 'LdO0VcRmIdF0JmZ6z5SyOW'
const GROUP = '120363999888777666@g.us'
const BOT = '2348000000000:12@s.whatsapp.net'

config.schoolGroup = 'support'
config.supportGroupLink = LINK

let inviteCodeChecks = 0
attachSchool({
  user: { id: BOT },
  groupGetInviteInfo: async () => {
    throw new Error('WhatsApp refused invite info for an existing member')
  },
  groupFetchAllParticipating: async () => ({
    [GROUP]: {
      id: GROUP,
      subject: 'VENOM SCHOOL',
      participants: [{ id: '2348000000000@s.whatsapp.net', admin: 'admin' }]
    }
  }),
  groupInviteCode: async (jid) => {
    inviteCodeChecks++
    if (jid !== GROUP) throw new Error('wrong group')
    return CODE
  }
})

const checks = [
  ['query parameters are stripped from the invite', parseInviteCode(LINK) === CODE],
  ['admin membership fallback resolves the classroom', (await classroom()) === GROUP],
  ['the live invite code was checked', inviteCodeChecks === 1]
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failed++
}

console.log(`\n═══ ${checks.length - failed} passed, ${failed} failed ═══`)
process.exit(failed ? 1 : 0)

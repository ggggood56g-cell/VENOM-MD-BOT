import {
  getContentType,
  jidNormalizedUser,
  downloadMediaMessage,
  isJidGroup,
  areJidsSameUser
} from 'baileys'
import config from '../config.js'
import { getVar } from './vars.js'

/**
 * Turns a raw Baileys message into a flat, predictable object.
 * Every plugin receives this as `m`, so plugins never touch proto internals.
 */
export async function serialize(sock, raw, store) {
  if (!raw?.message) return null

  const m = {}
  m.raw = raw
  m.key = raw.key
  m.id = raw.key.id
  m.chat = raw.key.remoteJid
  m.fromMe = !!raw.key.fromMe
  m.isGroup = isJidGroup(m.chat)
  m.isStatus = m.chat === 'status@broadcast'
  m.pushName = raw.pushName || 'Unknown'
  m.timestamp = Number(raw.messageTimestamp) || Math.floor(Date.now() / 1000)

  // bot's own jid
  const botJid = jidNormalizedUser(sock.user?.id || '')
  m.botJid = botJid
  // New WhatsApp groups address members by privacy-preserving LIDs. Baileys
  // exposes the bot's LID separately from its phone-number jid.
  m.botLid = jidNormalizedUser(sock.user?.lid || '')
  m.botNumber = botJid.split('@')[0].split(':')[0]

  // sender resolution: in groups the participant is the real author. Keep
  // participantAlt too: it is normally the PN counterpart when participant
  // is a LID (or vice versa).
  m.sender = m.isGroup
    ? jidNormalizedUser(raw.key.participant || raw.participant || '')
    : m.fromMe
      ? botJid
      : jidNormalizedUser(m.chat)
  m.senderAlt = m.isGroup
    ? jidNormalizedUser(raw.key.participantAlt || raw.participantAlt || '')
    : ''
  const senderPn = [m.sender, m.senderAlt].find((jid) => jid.endsWith('@s.whatsapp.net'))
  m.senderNumber = (senderPn || m.sender || '').split('@')[0].split(':')[0]

  // unwrap ephemeral / view-once / device-sent envelopes
  let content = raw.message
  if (content.ephemeralMessage) content = content.ephemeralMessage.message
  if (content.viewOnceMessage) content = content.viewOnceMessage.message
  if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message
  if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message
  if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message
  if (content.deviceSentMessage) content = content.deviceSentMessage.message
  m.message = content

  m.type = getContentType(content) || Object.keys(content)[0]
  m.msg = content[m.type]

  // plain text body across every message shape
  m.body =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content.templateButtonReplyMessage?.selectedId ||
    content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    content.eventMessage?.name ||
    ''
  m.text = m.body

  m.mentions = m.msg?.contextInfo?.mentionedJid || []
  m.expiration = m.msg?.contextInfo?.expiration || null
  m.isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(m.type)

  /* ------------------------- quoted message ------------------------- */
  const ctx = m.msg?.contextInfo
  const quotedRaw = ctx?.quotedMessage
  if (quotedRaw) {
    let q = quotedRaw
    if (q.ephemeralMessage) q = q.ephemeralMessage.message
    if (q.viewOnceMessage) q = q.viewOnceMessage.message
    if (q.viewOnceMessageV2) q = q.viewOnceMessageV2.message
    if (q.viewOnceMessageV2Extension) q = q.viewOnceMessageV2Extension.message
    if (q.documentWithCaptionMessage) q = q.documentWithCaptionMessage.message

    const qType = getContentType(q) || Object.keys(q)[0]
    const qSender = jidNormalizedUser(ctx.participant || '')

    m.quoted = {
      raw: quotedRaw,
      message: q,
      type: qType,
      msg: q[qType],
      id: ctx.stanzaId,
      sender: qSender,
      senderNumber: qSender.split('@')[0].split(':')[0],
      fromMe: areJidsSameUser(qSender, botJid),
      isMedia: ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(qType),
      body:
        q.conversation ||
        q.extendedTextMessage?.text ||
        q.imageMessage?.caption ||
        q.videoMessage?.caption ||
        q.documentMessage?.caption ||
        '',
      mentions: q[qType]?.contextInfo?.mentionedJid || [],
      /** message key, needed to react/delete/reply to the quoted message */
      key: {
        remoteJid: m.chat,
        fromMe: areJidsSameUser(qSender, botJid),
        id: ctx.stanzaId,
        participant: m.isGroup ? qSender : undefined
      },
      /** download the quoted media into a Buffer */
      download: () =>
        downloadMediaMessage(
          { key: { remoteJid: m.chat, id: ctx.stanzaId, fromMe: false, participant: qSender }, message: q },
          'buffer',
          {},
          { reuploadRequest: sock.updateMediaMessage }
        )
    }
    m.quoted.text = m.quoted.body
  } else {
    m.quoted = null
  }

  /* --------------------------- helpers --------------------------- */

  /** Download this message's media as a Buffer. */
  m.download = () =>
    downloadMediaMessage(raw, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage })

  /* Outgoing command replies in this chat, used by optional auto-cleanup. */
  m.commandResponses = []
  const rememberResponse = (jid, sent, keep = false) => {
    if (!keep && jid === m.chat && sent?.key?.id) m.commandResponses.push(sent.key)
    return sent
  }

  /** Reply to this message. Accepts a string or a full Baileys content object. */
  m.reply = async (text, options = {}) => {
    const content = typeof text === 'string' ? { text } : text
    const { jid = m.chat, keep = false, quoted, ...sendOptions } = options
    const sent = await sock.sendMessage(
      jid,
      { ...content, ...(m.expiration ? { ephemeralExpiration: m.expiration } : {}) },
      { quoted: quoted === null ? undefined : quoted || raw, ...sendOptions }
    )
    return rememberResponse(jid, sent, keep)
  }

  /** Send without quoting. Pass keep: true to exempt it from command cleanup. */
  m.send = async (text, options = {}) => {
    const content = typeof text === 'string' ? { text } : text
    const { jid = m.chat, keep = false, ...sendOptions } = options
    const sent = await sock.sendMessage(jid, content, sendOptions)
    return rememberResponse(jid, sent, keep)
  }

  /**
   * React to this message with an emoji.
   *
   * Sets m.reacted so the handler knows the plugin is managing its own
   * feedback and should not append an automatic ✅/❌ on top.
   */
  m.reacted = false
  m.react = (emoji) => {
    m.reacted = true
    return sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } })
  }

  /** The jid this command targets: mention > quoted author > argument. */
  m.target = (() => {
    if (m.mentions?.length) return m.mentions[0]
    if (m.quoted?.sender) return m.quoted.sender
    return null
  })()

  return m
}

/** Owner / sudo / admin permission resolution for a serialized message. */
export async function resolvePermissions(sock, m, sudoList = [], groupCache = null) {
  const owners = [...config.ownerNumbers, m.botNumber]
  m.isOwner = owners.includes(m.senderNumber) || m.fromMe
  m.isSudo = m.isOwner || sudoList.includes(m.senderNumber)

  m.isAdmin = false
  m.isBotAdmin = false
  m.groupMetadata = null
  m.groupName = ''
  m.participants = []

  if (m.isGroup) {
    try {
      // Connection events keep this cache current after promotions, joins and
      // removals. Reusing it avoids a WhatsApp metadata round-trip before
      // every single group command.
      m.groupMetadata = groupCache?.get?.(m.chat) || await sock.groupMetadata(m.chat)
      if (groupCache?.set && m.groupMetadata) groupCache.set(m.chat, m.groupMetadata)
      m.groupName = m.groupMetadata.subject
      m.participants = m.groupMetadata.participants || []

      /*
       * Baileys v7 group metadata may identify a participant by @lid while
       * sock.user.id is the same account's @s.whatsapp.net jid. Comparing
       * only `participant.id` therefore makes a real admin look like a
       * normal member. Check every PN/LID alias supplied by WhatsApp.
       */
      const find = (...wanted) => {
        const needles = wanted.filter(Boolean)
        return m.participants.find((p) => {
          const aliases = [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean)
          return needles.some((jid) => aliases.some((alias) => areJidsSameUser(alias, jid)))
        })
      }

      const me = find(m.sender, m.senderAlt)
      const bot = find(m.botJid, m.botLid)
      m.isAdmin = !!(me?.admin === 'admin' || me?.admin === 'superadmin' || me?.isAdmin || me?.isSuperAdmin)
      m.isBotAdmin = !!(bot?.admin === 'admin' || bot?.admin === 'superadmin' || bot?.isAdmin || bot?.isSuperAdmin)
      m.groupOwner = m.groupMetadata.owner
    } catch {
      /* metadata fetch can fail on huge groups - treat as non-admin */
    }
  }
  return m
}

export default serialize

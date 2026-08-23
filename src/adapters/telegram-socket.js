/**
 * A Baileys-shaped socket facade backed by the Telegram Bot API.
 *
 * The command router builds a `context` object whose helpers (`reply`, `send`,
 * `react`, `targetJid`) all funnel into `socket.sendMessage(...)`. Rather than
 * rewriting 552 plugins, this class speaks the small slice of the Baileys
 * socket surface those plugins actually use and translates it to Telegram.
 *
 * JID convention used across the Telegram adapter:
 *   private chat   ->  "<chatId>@s.whatsapp.net"
 *   group/channel  ->  "<chatId>@g.us"     (Telegram group ids are negative)
 * This keeps `details.isGroup`, `jidNumber()` and `isOwnerJid()` working
 * unchanged, because they only ever inspect the suffix and the digits.
 */

import { logger, safeError } from "../logger.js";

const TELEGRAM_TEXT_LIMIT = 4_096;
const TELEGRAM_CAPTION_LIMIT = 1_024;

export function chatIdFromJid(jid) {
  const raw = String(jid || "").split("@")[0];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : raw;
}

export function jidFromChat(chat) {
  if (!chat) return "";
  const suffix = chat.type === "private" ? "s.whatsapp.net" : "g.us";
  return `${chat.id}@${suffix}`;
}

export function jidFromUser(user) {
  return user ? `${user.id}@s.whatsapp.net` : "";
}

/**
 * WhatsApp renders a mention as the literal "@2348…" plus a `mentions` array.
 * Telegram has no such array: a mention must be an inline link to
 * `tg://user?id=<id>`. Rewrite every "@<digits>" that the plugin declared as a
 * mention into a real tappable link, so `.tagall` and friends work natively.
 */
export function applyMentions(text, mentions = []) {
  if (!mentions.length) return text;
  let output = String(text ?? "");
  for (const jid of mentions) {
    const id = String(jid).split("@")[0].replace(/\D/g, "");
    if (!id) continue;
    output = output.replace(
      new RegExp(`@${id}\\b`, "g"),
      `<a href="tg://user?id=${id}">@${id}</a>`,
    );
  }
  return output;
}

/** Telegram sends *entities*, not markdown. Convert WhatsApp markup to HTML. */
export function toTelegramHtml(text) {
  const escaped = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/```([\s\S]+?)```/g, (_m, code) => `<pre>${code}</pre>`)
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?)]|$)/g, (_m, lead, body) => `${lead}<b>${body}</b>`)
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?)]|$)/g, (_m, lead, body) => `${lead}<i>${body}</i>`)
    .replace(/(^|[\s(])~([^~\n]+)~(?=[\s.,!?)]|$)/g, (_m, lead, body) => `${lead}<s>${body}</s>`)
    .replace(/(^|[\s(])`([^`\n]+)`(?=[\s.,!?)]|$)/g, (_m, lead, body) => `${lead}<code>${body}</code>`);
}

/** Split oversized text on line boundaries so nothing is silently truncated. */
export function chunkText(text, limit = TELEGRAM_TEXT_LIMIT) {
  const value = String(text ?? "");
  if (value.length <= limit) return [value];
  const chunks = [];
  let current = "";
  for (const line of value.split("\n")) {
    const piece = line.length > limit ? line.match(new RegExp(`.{1,${limit}}`, "gs")) : [line];
    for (const part of piece) {
      if (current.length + part.length + 1 > limit) {
        if (current) chunks.push(current);
        current = part;
      } else {
        current = current ? `${current}\n${part}` : part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export default class TelegramSocket {
  constructor(telegram, { botInfo } = {}) {
    this.telegram = telegram;
    this.platform = "telegram";
    this.user = botInfo
      ? { id: `${botInfo.id}@s.whatsapp.net`, name: botInfo.first_name }
      : null;
    // Cache group metadata briefly: plugins call groupMetadata() freely and
    // Telegram rate-limits getChatAdministrators fairly aggressively.
    this.metadataCache = new Map();
  }

  static extra(options = {}) {
    const extra = { parse_mode: "HTML" };
    if (options.quoted?.key?.id) {
      extra.reply_parameters = { message_id: Number(options.quoted.key.id), allow_sending_without_reply: true };
    }
    if (options.replyTo) {
      extra.reply_parameters = { message_id: Number(options.replyTo), allow_sending_without_reply: true };
    }
    if (options.buttons) extra.reply_markup = { inline_keyboard: options.buttons };
    return extra;
  }

  /**
   * The single translation point. Accepts the Baileys content shapes the
   * plugins already produce and maps each to the matching Telegram method.
   */
  async sendMessage(jid, content = {}, options = {}) {
    const chatId = chatIdFromJid(jid);
    const extra = TelegramSocket.extra(options);

    try {
      if (content.delete) {
        const id = Number(content.delete.id);
        if (Number.isFinite(id)) await this.telegram.deleteMessage(chatId, id);
        return null;
      }

      if (content.react) {
        const id = Number(options.quoted?.key?.id ?? content.react.key?.id);
        if (!Number.isFinite(id)) return null;
        // Telegram only accepts a fixed emoji allow-list; failures are cosmetic.
        await this.telegram
          .setMessageReaction(chatId, id, [{ type: "emoji", emoji: content.react.text }])
          .catch(() => {});
        return null;
      }

      // Mentions are linkified *after* HTML escaping, otherwise the anchor
      // tags we inject would themselves be escaped.
      const render = (value) => applyMentions(toTelegramHtml(value), content.mentions);
      const caption = content.caption ? render(content.caption).slice(0, TELEGRAM_CAPTION_LIMIT) : undefined;

      if (content.image) {
        return await this.telegram.sendPhoto(chatId, sourceOf(content.image), { ...extra, caption });
      }
      if (content.video) {
        const method = content.gifPlayback ? "sendAnimation" : "sendVideo";
        return await this.telegram[method](chatId, sourceOf(content.video), { ...extra, caption });
      }
      if (content.sticker) {
        // Telegram wants .webp/.tgs — the media service already emits webp.
        return await this.telegram.sendSticker(chatId, sourceOf(content.sticker), TelegramSocket.extra(options));
      }
      if (content.audio) {
        const method = content.ptt ? "sendVoice" : "sendAudio";
        return await this.telegram[method](chatId, sourceOf(content.audio), { ...extra, caption });
      }
      if (content.document) {
        return await this.telegram.sendDocument(
          chatId,
          sourceOf(content.document, content.fileName),
          { ...extra, caption },
        );
      }
      if (content.poll) {
        return await this.telegram.sendPoll(
          chatId,
          String(content.poll.name).slice(0, 300),
          content.poll.values.slice(0, 10).map((value) => String(value).slice(0, 100)),
          { is_anonymous: false, allows_multiple_answers: (content.poll.selectableCount ?? 1) > 1 },
        );
      }

      const text = content.text ?? "";
      if (!String(text).trim()) return null;
      let last = null;
      for (const chunk of chunkText(render(text))) {
        last = await this.telegram.sendMessage(chatId, chunk, extra);
        delete extra.reply_parameters; // only quote on the first chunk
      }
      return last;
    } catch (error) {
      // Malformed HTML from a plugin should degrade to plain text, never crash.
      if (/can't parse entities/i.test(error?.description || error?.message || "")) {
        const plain = String(content.caption || content.text || "");
        return this.telegram
          .sendMessage(chatId, plain.slice(0, TELEGRAM_TEXT_LIMIT), { disable_web_page_preview: true })
          .catch(() => null);
      }
      logger.error({ error: safeError(error) }, "Telegram send failed");
      throw error;
    }
  }

  async sendPresenceUpdate(state, jid) {
    const action = state === "composing" ? "typing" : state === "recording" ? "record_voice" : null;
    if (!action) return;
    await this.telegram.sendChatAction(chatIdFromJid(jid), action).catch(() => {});
  }

  async readMessages() {
    /* Telegram marks messages read implicitly. */
  }

  async groupMetadata(jid) {
    const chatId = chatIdFromJid(jid);
    const cached = this.metadataCache.get(chatId);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;

    const [chat, admins, count] = await Promise.all([
      this.telegram.getChat(chatId),
      this.telegram.getChatAdministrators(chatId).catch(() => []),
      this.telegram.getChatMemberCount(chatId).catch(() => 0),
    ]);
    const value = {
      id: jid,
      subject: chat.title || "Telegram chat",
      desc: chat.description || "",
      owner: jidFromUser(admins.find((a) => a.status === "creator")?.user),
      size: count,
      participants: admins.map((member) => ({
        id: jidFromUser(member.user),
        admin: member.status === "creator" ? "superadmin" : "admin",
        name: member.user?.first_name,
      })),
    };
    this.metadataCache.set(chatId, { at: Date.now(), value });
    return value;
  }

  async groupParticipantsUpdate(jid, participants, action) {
    const chatId = chatIdFromJid(jid);
    const results = [];
    for (const participant of participants) {
      const userId = chatIdFromJid(participant);
      try {
        if (action === "remove") {
          await this.telegram.banChatMember(chatId, userId);
          await this.telegram.unbanChatMember(chatId, userId, { only_if_banned: true });
        } else if (action === "promote") {
          await this.telegram.promoteChatMember(chatId, userId, {
            can_delete_messages: true,
            can_restrict_members: true,
            can_invite_users: true,
            can_pin_messages: true,
          });
        } else if (action === "demote") {
          await this.telegram.promoteChatMember(chatId, userId, {
            can_delete_messages: false,
            can_restrict_members: false,
            can_invite_users: false,
            can_pin_messages: false,
          });
        } else {
          throw new Error("Telegram bots cannot add members. Share the invite link instead.");
        }
        results.push({ status: "200", jid: participant });
      } catch (error) {
        results.push({ status: "403", jid: participant, error: safeError(error) });
      }
    }
    this.metadataCache.delete(chatId);
    return results;
  }

  async groupInviteCode(jid) {
    const link = await this.telegram.exportChatInviteLink(chatIdFromJid(jid));
    return String(link).split("/").pop();
  }

  async groupRevokeInvite(jid) {
    const link = await this.telegram.exportChatInviteLink(chatIdFromJid(jid));
    return String(link).split("/").pop();
  }

  async groupUpdateSubject(jid, subject) {
    await this.telegram.setChatTitle(chatIdFromJid(jid), String(subject).slice(0, 128));
    this.metadataCache.delete(chatIdFromJid(jid));
  }

  async groupUpdateDescription(jid, description) {
    await this.telegram.setChatDescription(chatIdFromJid(jid), String(description || "").slice(0, 255));
    this.metadataCache.delete(chatIdFromJid(jid));
  }

  async groupSettingUpdate(jid, setting) {
    const locked = setting === "announcement";
    await this.telegram.setChatPermissions(chatIdFromJid(jid), {
      can_send_messages: !locked,
      can_send_other_messages: !locked,
      can_send_polls: !locked,
      can_add_web_page_previews: !locked,
      can_invite_users: true,
    });
  }

  async groupLeave(jid) {
    await this.telegram.leaveChat(chatIdFromJid(jid));
  }

  async profilePictureUrl(jid) {
    const photos = await this.telegram.getUserProfilePhotos(chatIdFromJid(jid), { limit: 1 });
    const fileId = photos?.photos?.[0]?.slice(-1)?.[0]?.file_id;
    if (!fileId) throw new Error("No profile photo.");
    const link = await this.telegram.getFileLink(fileId);
    return String(link);
  }

  async onWhatsApp() {
    // No Telegram equivalent: bots cannot look up arbitrary users.
    return [];
  }

  async fetchStatus() {
    return [{ status: { status: "" } }];
  }

  // Unsupported-by-design surfaces. These throw a readable message that the
  // router already turns into a user-facing "❌ …" reply.
  async chatModify() {
    throw new Error("Not available on Telegram.");
  }

  async updateBlockStatus() {
    throw new Error("Telegram bots cannot block users. Use group ban instead.");
  }

  async groupAcceptInvite() {
    throw new Error("Telegram bots must be added to a group by an admin.");
  }

  async groupCreate() {
    throw new Error("Telegram bots cannot create groups.");
  }

  async groupFetchAllParticipating() {
    return {};
  }

  async updateProfileName(name) {
    await this.telegram.setMyName?.(String(name).slice(0, 64));
  }

  async updateProfileStatus(status) {
    await this.telegram.setMyShortDescription?.(String(status).slice(0, 120));
  }

  async updateProfilePicture() {
    throw new Error("Change the bot photo with @BotFather → /setuserpic.");
  }

  async removeProfilePicture() {
    throw new Error("Change the bot photo with @BotFather → /setuserpic.");
  }

  async fetchPrivacySettings() {
    return {};
  }

  async fetchBlocklist() {
    return [];
  }

  async updateStatusPrivacy() {
    throw new Error("Not available on Telegram.");
  }

  async updateLastSeenPrivacy() {
    throw new Error("Not available on Telegram.");
  }

  async updateOnlinePrivacy() {
    throw new Error("Not available on Telegram.");
  }

  async updateProfilePicturePrivacy() {
    throw new Error("Not available on Telegram.");
  }

  async updateReadReceiptsPrivacy() {
    throw new Error("Not available on Telegram.");
  }

  async updateGroupsAddPrivacy() {
    throw new Error("Not available on Telegram.");
  }
}

/** Telegraf accepts `{ source: Buffer }`, a URL string, or a file_id. */
function sourceOf(value, filename) {
  if (Buffer.isBuffer(value)) return filename ? { source: value, filename } : { source: value };
  if (typeof value === "string") return value;
  if (value?.url) return value.url;
  if (value?.stream) return { source: value.stream, filename };
  return value;
}

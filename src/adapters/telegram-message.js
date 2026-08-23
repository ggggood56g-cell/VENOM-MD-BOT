/**
 * Translate a Telegram update into the same `details` object that
 * `src/message.js` produces for Baileys, so `CommandRouter.handle()` needs no
 * platform branching at all.
 */

import { jidFromChat, jidFromUser } from "./telegram-socket.js";

const MEDIA_TYPES = [
  ["photo", "imageMessage"],
  ["video", "videoMessage"],
  ["animation", "videoMessage"],
  ["sticker", "stickerMessage"],
  ["voice", "audioMessage"],
  ["audio", "audioMessage"],
  ["document", "documentMessage"],
  ["video_note", "videoMessage"],
];

/** Largest PhotoSize wins; every other media type is a single object. */
function mediaOf(message = {}) {
  for (const [key, waType] of MEDIA_TYPES) {
    const value = message[key];
    if (!value) continue;
    const file = Array.isArray(value) ? value[value.length - 1] : value;
    return { key, waType, file };
  }
  return null;
}

/**
 * Build a Baileys-shaped raw message. Media files are represented by their
 * Telegram `file_id`, which `downloadTelegramMedia()` resolves on demand.
 */
function rawMessage(message, botId) {
  const media = mediaOf(message);
  const text = message.text || message.caption || "";
  const content = media
    ? {
        [media.waType]: {
          caption: message.caption || "",
          mimetype: media.file.mime_type || "",
          fileLength: media.file.file_size || 0,
          fileName: media.file.file_name || "",
          seconds: media.file.duration || 0,
          telegramFileId: media.file.file_id,
        },
      }
    : { conversation: text };

  return {
    key: {
      remoteJid: jidFromChat(message.chat),
      id: String(message.message_id),
      fromMe: message.from?.id === botId,
      participant: message.chat?.type === "private" ? undefined : jidFromUser(message.from),
    },
    message: content,
    messageTimestamp: message.date || Math.floor(Date.now() / 1000),
    pushName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" "),
  };
}

export function telegramDetails(update, botId) {
  const message =
    update?.message || update?.edited_message || update?.channel_post;
  if (!message?.chat) return null;

  const chat = jidFromChat(message.chat);
  const sender = message.chat?.type === "private" ? chat : jidFromUser(message.from);
  const media = mediaOf(message);
  const text = String(message.text || message.caption || "").trim();

  const mentionedJids = (message.entities || message.caption_entities || [])
    .filter((entity) => entity.type === "text_mention" && entity.user)
    .map((entity) => jidFromUser(entity.user));

  const replied = message.reply_to_message;
  const quoted = replied ? rawMessage(replied, botId) : null;

  return {
    raw: rawMessage(message, botId),
    content: rawMessage(message, botId).message,
    type: media ? media.waType : "conversation",
    value: { text, caption: message.caption || "" },
    text,
    chat,
    sender,
    pushName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").slice(0, 80),
    isGroup: message.chat?.type === "group" || message.chat?.type === "supergroup",
    isStatus: false,
    fromMe: message.from?.id === botId,
    mentionedJids,
    quoted,
    quotedSender: replied ? jidFromUser(replied.from) : "",
    timestamp: message.date || 0,
    // Telegram-only extras, ignored by shared plugins.
    telegram: { message, chatId: message.chat?.id, userId: message.from?.id },
  };
}

/**
 * `src/message.js#downloadMedia` equivalent. The plugins call
 * `downloadMedia(context.socket, target, maxBytes)`; the Telegram context
 * rebinds that import to this function.
 */
export async function downloadTelegramMedia(socket, raw, maximumBytes) {
  const content = raw?.message || {};
  const entry = Object.values(content).find((value) => value?.telegramFileId);
  if (!entry) throw new Error("Reply to an image, video, sticker or audio file.");

  if (entry.fileLength && entry.fileLength > maximumBytes) {
    throw new Error(`Media is too large. Maximum: ${Math.floor(maximumBytes / 1024 / 1024)} MB.`);
  }

  const link = await socket.telegram.getFileLink(entry.telegramFileId);
  const response = await fetch(String(link), { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("The media could not be downloaded.");
  if (buffer.length > maximumBytes) {
    throw new Error(`Media is too large. Maximum: ${Math.floor(maximumBytes / 1024 / 1024)} MB.`);
  }
  return buffer;
}

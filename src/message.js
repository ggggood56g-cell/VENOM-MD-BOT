import { downloadMediaMessage, getContentType } from "baileys";

import { normalizeJid } from "./utils.js";

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
];

export function unwrapMessage(message = {}) {
  let content = message;
  for (let index = 0; index < 8; index += 1) {
    const wrapper = WRAPPERS.find((name) => content?.[name]?.message);
    if (!wrapper) break;
    content = content[wrapper].message;
  }
  return content || {};
}

export function messageText(rawMessage) {
  const content = unwrapMessage(rawMessage?.message);
  const type = getContentType(content);
  const value = content[type] || {};
  return String(
    content.conversation ||
      value.text ||
      value.caption ||
      value.selectedDisplayText ||
      value.selectedButtonId ||
      value.singleSelectReply?.selectedRowId ||
      value.nativeFlowResponseMessage?.paramsJson ||
      "",
  ).trim();
}

export function messageDetails(rawMessage) {
  const content = unwrapMessage(rawMessage?.message);
  const type = getContentType(content);
  const value = content[type] || {};
  const contextInfo = value.contextInfo || {};
  const chat = normalizeJid(rawMessage?.key?.remoteJid);
  const sender = normalizeJid(
    rawMessage?.key?.participant || rawMessage?.participant || chat,
  );
  const quoted = contextInfo.quotedMessage
    ? {
        key: {
          remoteJid: chat,
          id: contextInfo.stanzaId,
          participant: normalizeJid(contextInfo.participant),
          fromMe: false,
        },
        message: contextInfo.quotedMessage,
      }
    : null;

  return {
    raw: rawMessage,
    content,
    type,
    value,
    text: messageText(rawMessage),
    chat,
    sender,
    pushName: String(rawMessage?.pushName || "").trim().slice(0, 80),
    isGroup: chat.endsWith("@g.us"),
    isStatus: chat === "status@broadcast",
    fromMe: rawMessage?.key?.fromMe === true,
    mentionedJids: (contextInfo.mentionedJid || []).map(normalizeJid),
    quoted,
    quotedSender: normalizeJid(contextInfo.participant),
    timestamp: Number(rawMessage?.messageTimestamp || 0),
  };
}

export function mediaMessage(details) {
  const ownType = getContentType(details.content);
  if (
    ["imageMessage", "videoMessage", "stickerMessage", "audioMessage"].includes(
      ownType,
    )
  ) {
    return details.raw;
  }
  return details.quoted;
}

export async function downloadMedia(socket, rawMessage, maximumBytes) {
  if (!rawMessage?.message) throw new Error("Reply to an image, video, sticker or audio file.");
  // Platform dispatch: the Telegram adapter stores a `file_id` on the message
  // instead of Baileys media keys, so it resolves downloads its own way. This
  // keeps every plugin's `downloadMedia(context.socket, …)` call unchanged.
  if (socket?.platform === "telegram") {
    const { downloadTelegramMedia } = await import("./adapters/telegram-message.js");
    return downloadTelegramMedia(socket, rawMessage, maximumBytes);
  }
  const buffer = await downloadMediaMessage(
    rawMessage,
    "buffer",
    {},
    {
      logger: socket.logger,
      reuploadRequest: socket.updateMediaMessage,
    },
  );
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("The media could not be downloaded.");
  }
  if (buffer.length > maximumBytes) {
    throw new Error(`Media is too large. Maximum: ${Math.floor(maximumBytes / 1024 / 1024)} MB.`);
  }
  return buffer;
}

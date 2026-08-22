import { getContentType } from "baileys";
import { fileTypeFromBuffer } from "file-type";

import { downloadMedia } from "../message.js";
import { normalizeJid } from "../utils.js";

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
];

const VIEW_ONCE_WRAPPERS = new Set([
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
]);

const REVEALABLE_TYPES = [
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "stickerMessage",
];

/** Walk the wrapper chain and report whether any layer is a view once wrapper. */
export function isViewOnce(message = {}) {
  let content = message;
  for (let index = 0; index < 8; index += 1) {
    const wrapper = WRAPPERS.find((name) => content?.[name]?.message);
    if (!wrapper) return false;
    if (VIEW_ONCE_WRAPPERS.has(wrapper)) return true;
    content = content[wrapper].message;
  }
  return false;
}

/** Return the innermost message content beneath any wrappers. */
export function innerMessage(message = {}) {
  let content = message;
  for (let index = 0; index < 8; index += 1) {
    const wrapper = WRAPPERS.find((name) => content?.[name]?.message);
    if (!wrapper) break;
    content = content[wrapper].message;
  }
  return content || {};
}

/** Build the re-sendable payload for a downloaded view once media buffer. */
export function buildRevealMessage({ type, value = {}, buffer, mimetype }) {
  const caption = String(value.caption || "").trim();
  if (type === "imageMessage") {
    return { image: buffer, caption: caption || "🔓 View once • VENOM MD" };
  }
  if (type === "videoMessage") {
    return {
      video: buffer,
      caption: caption || "🔓 View once • VENOM MD",
      gifPlayback: value.gifPlayback === true,
    };
  }
  if (type === "audioMessage") {
    const mime = String(mimetype || "");
    const voiceNote = mime.includes("ogg") || value.ptt === true;
    return {
      audio: buffer,
      mimetype: voiceNote ? "audio/ogg; codecs=opus" : mime || "audio/mpeg",
      ptt: true,
    };
  }
  return { sticker: buffer };
}

async function revealTarget(context) {
  if (!context.store.feature("vvCmd")) {
    throw new Error("View once commands are disabled. Ask the owner to enable them with vvCmd on.");
  }
  const target = context.details.quoted;
  if (!target) throw new Error("Reply to a view once photo, video, voice note or sticker.");
  if (!isViewOnce(target.message)) throw new Error("That message is not a view once message.");

  const content = innerMessage(target.message);
  const type = getContentType(content);
  if (!REVEALABLE_TYPES.includes(type)) {
    throw new Error("That view once message has no downloadable media.");
  }

  const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
  const detected = await fileTypeFromBuffer(buffer);
  return {
    type,
    value: content[type] || {},
    buffer,
    mimetype: detected?.mime || "application/octet-stream",
  };
}

/** Prefer the real phone JID when the group exposes the sender only as a LID. */
async function privateJid(context) {
  const sender = normalizeJid(context.sender);
  if (!sender.endsWith("@lid")) return sender;
  try {
    const phone = await context.socket?.signalRepository?.lidMapping?.getPNForLID?.(sender);
    if (phone) return normalizeJid(phone);
  } catch {
    // Fall back to the LID; Baileys can deliver to LIDs on newer accounts.
  }
  return sender;
}

export default [
  {
    name: "vv",
    aliases: ["antivv"],
    category: "media",
    description: "Remove view once from a replied photo, video, voice note or sticker.",
    usage: "vv (reply to a view once message)",
    async execute(context) {
      const media = await revealTarget(context);
      await context.send(buildRevealMessage(media));
    },
  },
  {
    name: "vvpr",
    aliases: ["vvdm"],
    category: "media",
    description: "Reveal a view once message and send the media to your private chat.",
    usage: "vvpr (reply to a view once message)",
    async execute(context) {
      const media = await revealTarget(context);
      const target = await privateJid(context);
      await context.socket.sendMessage(target, buildRevealMessage(media));
      if (context.details.isGroup) {
        await context.reply(`✅ View once media sent to your DM @${context.senderNumber}.`, {
          mentions: [target],
        });
      }
    },
  },
];

import { getContentType } from "baileys";
import { fileTypeFromBuffer } from "file-type";

import { downloadMedia, mediaMessage, unwrapMessage } from "../message.js";
import {
  addStickerMetadata,
  imageToSticker,
  stickerToImage,
  videoToSticker,
} from "../services/media.js";

function targetType(rawMessage) {
  return getContentType(unwrapMessage(rawMessage?.message));
}

export default [
  {
    name: "sticker",
    aliases: ["s", "stiker"],
    category: "media",
    description: "Turn an image or short video into a sticker.",
    usage: "sticker (send or reply to media)",
    async execute(context) {
      const target = mediaMessage(context.details);
      const type = targetType(target);
      if (!["imageMessage", "videoMessage", "stickerMessage"].includes(type)) {
        throw new Error("Send or reply to an image, sticker, or video up to 8 seconds.");
      }
      const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
      const converted = type === "videoMessage"
        ? await videoToSticker(buffer)
        : await imageToSticker(buffer);
      const sticker = await addStickerMetadata(
        converted,
        context.config.packname,
        context.config.author,
      );
      await context.send({ sticker });
    },
  },
  {
    name: "toimg",
    aliases: ["toimage"],
    category: "media",
    description: "Convert a sticker back to a PNG image.",
    usage: "toimg (reply to a sticker)",
    async execute(context) {
      const target = mediaMessage(context.details);
      if (targetType(target) !== "stickerMessage") throw new Error("Reply to a sticker.");
      const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
      await context.send({ image: await stickerToImage(buffer), caption: "Converted by VENOM MD" });
    },
  },
  {
    name: "mediainfo",
    aliases: ["fileinfo"],
    category: "media",
    description: "Inspect a replied media file's format and size.",
    usage: "mediainfo (reply to media)",
    async execute(context) {
      const target = mediaMessage(context.details);
      if (!target) throw new Error("Reply to a media file.");
      const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
      const type = await fileTypeFromBuffer(buffer);
      await context.reply(
        `📦 Type: ${type?.mime || "unknown"}\nExtension: ${type?.ext || "unknown"}\nSize: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
      );
    },
  },
];

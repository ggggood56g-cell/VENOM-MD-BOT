import { getContentType } from "baileys";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { downloadMedia, mediaMessage, unwrapMessage } from "../message.js";
import { fetchBuffer } from "../services/http.js";
import { jidNumber } from "../utils.js";

async function sourceImage(context) {
  const target = mediaMessage(context.details);
  const type = getContentType(unwrapMessage(target?.message));
  if (!["imageMessage", "stickerMessage"].includes(type)) {
    throw new Error("Send or reply to an image or sticker.");
  }
  return downloadMedia(context.socket, target, context.config.maxMediaBytes);
}

const effects = {
  blur2: (image) => image.blur(8),
  enhance: (image) => image.normalize().sharpen({ sigma: 1.3 }),
  flipv: (image) => image.flip(),
  flop: (image) => image.flop(),
  grey: (image) => image.grayscale(),
  negate: (image) => image.negate({ alpha: false }),
  sepia: (image) => image.recomb([
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
  ]),
  sharpen: (image) => image.sharpen({ sigma: 2 }),
};

export default [
  ...Object.entries(effects).map(([name, transform]) => ({
    name,
    category: "image",
    description: `Apply the ${name} image effect.`,
    usage: `${name} (send or reply to an image)`,
    async execute(context) {
      const input = await sourceImage(context);
      const output = await transform(sharp(input, { limitInputPixels: 40_000_000 }))
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      await context.send({ image: output, caption: `✨ ${name} • VENOM MD` });
    },
  })),
  {
    name: "pixelate",
    category: "image",
    description: "Apply a pixel-art effect to an image.",
    async execute(context) {
      const input = await sourceImage(context);
      const metadata = await sharp(input).metadata();
      const width = Math.min(1024, metadata.width || 512);
      const height = Math.min(1024, metadata.height || 512);
      const output = await sharp(input)
        .resize(Math.max(16, Math.round(width / 24)), Math.max(16, Math.round(height / 24)), { fit: "fill" })
        .resize(width, height, { kernel: "nearest" })
        .png()
        .toBuffer();
      await context.send({ image: output, caption: "🟪 Pixelated by VENOM MD" });
    },
  },
  {
    name: "rotate",
    category: "image",
    description: "Rotate an image by a selected angle.",
    usage: "rotate [degrees]",
    async execute(context) {
      const angle = Number(context.args[0] || 90);
      if (!Number.isFinite(angle) || Math.abs(angle) > 3600) throw new Error("Enter a valid rotation angle.");
      const output = await sharp(await sourceImage(context)).rotate(angle, { background: "#00000000" }).png().toBuffer();
      await context.send({ image: output, caption: `↻ Rotated ${angle}°` });
    },
  },
  {
    name: "imageinfo",
    category: "image",
    description: "Show image dimensions, format and size.",
    async execute(context) {
      const input = await sourceImage(context);
      const [metadata, type] = await Promise.all([sharp(input).metadata(), fileTypeFromBuffer(input)]);
      await context.reply(
        `🖼️ Format: ${type?.ext || metadata.format || "unknown"}\nDimensions: ${metadata.width || "?"} × ${metadata.height || "?"}\nChannels: ${metadata.channels || "?"}\nSize: ${(input.length / 1024).toFixed(1)} KB`,
      );
    },
  },
  {
    name: "couple",
    category: "image",
    description: "Create a side-by-side image with a mentioned user.",
    usage: "couple @user",
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention or quote another user.");
      const urls = await Promise.all([
        context.socket.profilePictureUrl(context.sender, "image"),
        context.socket.profilePictureUrl(target, "image"),
      ]).catch(() => {
        throw new Error("Both profile photos must be visible to the bot.");
      });
      const pictures = await Promise.all(
        urls.map(async (url) => {
          const hostname = new URL(url).hostname;
          const { buffer } = await fetchBuffer(url, {
            allowedHosts: [hostname],
            maximumBytes: 5 * 1024 * 1024,
          });
          return sharp(buffer).resize(500, 500, { fit: "cover" }).jpeg().toBuffer();
        }),
      );
      const canvas = await sharp({
        create: { width: 1000, height: 560, channels: 3, background: "#180726" },
      })
        .composite([
          { input: pictures[0], left: 0, top: 0 },
          { input: pictures[1], left: 500, top: 0 },
          {
            input: Buffer.from(`<svg width="1000" height="560"><text x="500" y="530" text-anchor="middle" fill="#ff4fa3" font-size="58" font-family="sans-serif">♥ VENOM COUPLE ♥</text></svg>`),
            left: 0,
            top: 0,
          },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();
      await context.send({
        image: canvas,
        caption: `💞 @${jidNumber(context.sender)} × @${jidNumber(target)}`,
        mentions: [context.sender, target],
      });
    },
  },
];

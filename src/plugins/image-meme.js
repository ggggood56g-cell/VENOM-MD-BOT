import { getContentType } from "baileys";
import sharp from "sharp";

import { downloadMedia, mediaMessage, unwrapMessage } from "../message.js";
import { fetchBuffer } from "../services/http.js";

const MEMES = [
  "ad", "alert", "biden", "blur", "carbon", "caution", "clown", "communism",
  "drake", "drip", "facts", "fakechat", "greyscale", "gun", "invert", "jail",
  "jailbars", "mnm", "oogway", "pooh", "rainbow", "rip-meme", "sadcat", "stonks",
  "trigger-meme", "uncover", "unforgivable", "wanted", "wasted",
];

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function inputImage(context) {
  const target = mediaMessage(context.details);
  const type = getContentType(unwrapMessage(target?.message));
  if (["imageMessage", "stickerMessage"].includes(type)) {
    return downloadMedia(context.socket, target, context.config.maxMediaBytes);
  }
  const user = context.targetJid() || context.sender;
  const url = await context.socket.profilePictureUrl(user, "image").catch(() => "");
  if (!url) throw new Error("Send/reply to an image or use a user with a visible profile photo.");
  return (await fetchBuffer(url, {
    allowedHosts: [new URL(url).hostname],
    maximumBytes: context.config.maxMediaBytes,
  })).buffer;
}

async function createMeme(buffer, style, customText) {
  let image = sharp(buffer, { limitInputPixels: 40_000_000 }).resize(768, 768, { fit: "cover" });
  if (["greyscale", "wasted", "sadcat", "rip-meme"].includes(style)) image = image.grayscale();
  if (style === "blur") image = image.blur(10);
  if (style === "invert") image = image.negate({ alpha: false });
  if (["trigger-meme", "alert", "caution"].includes(style)) image = image.tint("#ff3b30");
  if (style === "rainbow") image = image.modulate({ saturation: 2.4, hue: 90 });
  const base = await image.png().toBuffer();
  const title = escapeXml(style.toUpperCase().replaceAll("-", " "));
  const subtitle = escapeXml(String(customText || "VENOM MD BOT").slice(0, 70));
  const accent = ["alert", "caution", "trigger-meme", "wanted"].includes(style) ? "#ffcc00" : "#39ff14";
  const overlay = Buffer.from(`
    <svg width="768" height="768" xmlns="http://www.w3.org/2000/svg">
      <rect y="0" width="768" height="110" fill="#000" fill-opacity="0.75"/>
      <rect y="645" width="768" height="123" fill="#000" fill-opacity="0.78"/>
      <rect x="15" y="15" width="738" height="738" fill="none" stroke="${accent}" stroke-width="10"/>
      <text x="384" y="73" text-anchor="middle" fill="${accent}" font-family="DejaVu Sans, sans-serif" font-size="54" font-weight="900">${title}</text>
      <text x="384" y="705" text-anchor="middle" fill="#fff" font-family="DejaVu Sans, sans-serif" font-size="36" font-weight="700">${subtitle}</text>
      <text x="384" y="744" text-anchor="middle" fill="${accent}" font-family="DejaVu Sans, sans-serif" font-size="18" letter-spacing="5">VENOM MD</text>
    </svg>`);
  return sharp(base).composite([{ input: overlay }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

export default MEMES.map((name) => ({
  name,
  category: "image-meme",
  description: `Create an original ${name} meme from an image or profile photo.`,
  usage: `${name} [caption]`,
  async execute(context) {
    const output = await createMeme(await inputImage(context), name, context.query);
    await context.send({ image: output, caption: `${name.toUpperCase()} • ${context.config.botName}` });
  },
}));

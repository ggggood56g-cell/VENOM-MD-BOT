import { randomBytes } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import PDFDocument from "pdfkit";
import qrcode from "qrcode";

import BRAND from "../System/Branding.js";
import { ffmpegBinary, toAudio } from "../System/File-Converter.js";
import { CatboxUpload, webp2mp4File } from "../System/Uploader.js";

const execFileAsync = promisify(execFile);
const cacheDir = path.resolve("System", "Cache");

const mergedCommands = [
  "toimg",
  "toimage",
  "togif",
  "tomp4",
  "tomp3",
  "toaudio",
  "tourl",
  "topdf",
  "imgtopdf",
  "toqr",
];

const randomCachePath = (extension) =>
  path.join(cacheDir, `${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`);

const safeUnlink = async (filePath) => {
  if (filePath) await fs.promises.unlink(filePath).catch(() => {});
};

const imageBufferToPdf = (image) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.once("error", reject);
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.addPage({ size: "A4", margin: 0 });
    doc.image(image, 0, 0, { fit: [595.28, 841.89], align: "center", valign: "center" });
    doc.end();
  });

export default {
  name: "converters",
  alias: [...mergedCommands],
  uniquecommands: [
    "toimg",
    "togif",
    "tomp4",
    "tomp3",
    "toaudio",
    "tourl",
    "topdf",
    "toqr",
  ],
  description: "Media and document conversion commands",
  start: async (Venom, m, { inputCMD, text, quoted, doReact, prefix, mime }) => {
    switch (inputCMD) {
      case "toimg":
      case "toimage": {
        if (!m.quoted || !/webp/i.test(mime)) {
          await doReact("❔");
          return m.reply("Reply to a non-animated sticker to convert it to an image.");
        }

        await fs.promises.mkdir(cacheDir, { recursive: true });
        await doReact("🎴");
        let inputPath;
        const outputPath = randomCachePath("png");
        try {
          inputPath = await Venom.downloadAndSaveMediaMessage(quoted);
          await execFileAsync(ffmpegBinary, ["-y", "-i", inputPath, outputPath], {
            timeout: 90_000,
            maxBuffer: 1024 * 1024,
          });
          const image = await fs.promises.readFile(outputPath);
          await Venom.sendMessage(
            m.from,
            { image, caption: `_Converted by:_ *${BRAND.botName}*` },
            { quoted: m },
          );
        } catch (error) {
          console.error(`[ VENOM ] Sticker conversion failed: ${error.message}`);
          await doReact("❌");
          await m.reply(
            `That sticker could not be converted. For animated stickers, use *${prefix}togif* or *${prefix}tomp4*.`,
          );
        } finally {
          await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
        }
        break;
      }

      case "tomp4":
      case "togif": {
        if (!m.quoted || !/webp/i.test(mime)) {
          await doReact("❔");
          return m.reply("Reply to an animated sticker to convert it.");
        }

        await doReact("🎴");
        let inputPath;
        try {
          inputPath = await Venom.downloadAndSaveMediaMessage(quoted);
          const converted = await webp2mp4File(inputPath);
          if (!converted?.result) throw new Error("The conversion service returned no video.");
          await Venom.sendMessage(
            m.from,
            {
              video: { url: converted.result },
              caption: `_Converted by:_ *${BRAND.botName}*`,
              ...(inputCMD === "togif" ? { gifPlayback: true } : {}),
            },
            { quoted: m },
          );
        } catch (error) {
          console.error(`[ VENOM ] Animated sticker conversion failed: ${error.message}`);
          await doReact("❌");
          await m.reply("The animated sticker could not be converted. Try again later.");
        } finally {
          await safeUnlink(inputPath);
        }
        break;
      }

      case "tomp3":
      case "toaudio": {
        if (!m.quoted || !/video|audio/i.test(mime) || /document/i.test(mime)) {
          await doReact("❔");
          return m.reply(
            `Reply to a video or audio message with *${prefix}${inputCMD}*.`,
          );
        }

        await doReact("🎶");
        try {
          const media = await quoted.download();
          await Venom.sendPresenceUpdate("recording", m.from);
          const audio = await toAudio(media, "mp4");
          const payload =
            inputCMD === "tomp3"
              ? {
                  document: audio,
                  mimetype: "audio/mpeg",
                  fileName: `Converted by ${BRAND.botName} ${m.id}.mp3`,
                }
              : { audio, mimetype: "audio/mpeg" };
          await Venom.sendMessage(m.from, payload, { quoted: m });
        } catch (error) {
          console.error(`[ VENOM ] Audio conversion failed: ${error.message}`);
          await doReact("❌");
          await m.reply("The media could not be converted to audio.");
        }
        break;
      }

      case "tourl": {
        if (!m.quoted || !/image|video|audio|document|octet|application/i.test(mime)) {
          await doReact("❔");
          return m.reply(
            `Reply to an image, video, audio message, or document with *${prefix}tourl*.`,
          );
        }

        await doReact("🔗");
        let inputPath;
        try {
          inputPath = await Venom.downloadAndSaveMediaMessage(quoted);
          const url = await CatboxUpload(inputPath);
          const mediaType = /image/i.test(mime)
            ? "Image"
            : /video/i.test(mime)
              ? "Video"
              : /audio/i.test(mime)
                ? "Audio"
                : "File";
          await m.reply(`*Generated ${mediaType} URL:*\n\n${url}`);
        } catch (error) {
          console.error(`[ VENOM ] Media upload failed: ${error.message}`);
          await doReact("❌");
          await m.reply("The media could not be downloaded or uploaded. Try again later.");
        } finally {
          await safeUnlink(inputPath);
        }
        break;
      }

      case "topdf":
      case "imgtopdf": {
        if (!m.quoted || !/image/i.test(mime)) {
          await doReact("❔");
          return m.reply("Reply to an image to convert it to PDF.");
        }

        await doReact("📑");
        try {
          const image = await quoted.download();
          const pdf = await imageBufferToPdf(image);
          await Venom.sendMessage(
            m.from,
            {
              document: pdf,
              mimetype: "application/pdf",
              fileName: `Converted by ${BRAND.botName}.pdf`,
            },
            { quoted: m },
          );
        } catch (error) {
          console.error(`[ VENOM ] PDF conversion failed: ${error.message}`);
          await doReact("❌");
          await m.reply("The image could not be converted to PDF.");
        }
        break;
      }

      case "toqr": {
        const qrText = String(text || "").trim();
        if (!qrText) {
          await doReact("❔");
          return m.reply(
            `Provide text or a URL. Example: *${prefix}toqr ${BRAND.githubUrl}*`,
          );
        }
        if (qrText.length > 2048) {
          await doReact("❌");
          return m.reply("QR input must not exceed 2,048 characters.");
        }

        await doReact("✅");
        const image = await qrcode.toBuffer(qrText, {
          type: "png",
          width: 640,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        await Venom.sendMessage(
          m.from,
          { image, caption: `*Source:* ${qrText.slice(0, 500)}` },
          { quoted: m },
        );
        break;
      }

      default:
        break;
    }
  },
};

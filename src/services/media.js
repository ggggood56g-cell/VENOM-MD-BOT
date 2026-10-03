import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import webp from "node-webpmux";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export async function imageToSticker(buffer) {
  return sharp(buffer, { animated: true, limitInputPixels: 40_000_000 })
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

export async function addStickerMetadata(buffer, packname, author) {
  const metadata = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": "https://github.com/MykelGoal/VENOM-MD-BOT",
      "sticker-pack-name": String(packname || "VENOM MD BOT").slice(0, 64),
      "sticker-pack-publisher": String(author || "TAPRUSH EMP (Micheal)").slice(0, 64),
      emojis: ["⚡"],
    }),
    "utf8",
  );
  const header = Buffer.from(
    [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ],
  );
  header.writeUInt32LE(metadata.length, 14);

  const image = new webp.Image();
  await image.load(buffer);
  image.exif = Buffer.concat([header, metadata]);
  return image.save(null);
}

export async function stickerToImage(buffer) {
  return sharp(buffer, { animated: false, limitInputPixels: 40_000_000 })
    .png()
    .toBuffer();
}

export async function ffmpegConvert(
  buffer,
  args,
  { inputExtension = "bin", outputExtension = "bin", timeout = 120_000, maximumBytes = 64 * 1024 * 1024 } = {},
) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("Media input is empty.");
  if (!Array.isArray(args) || !args.every((argument) => typeof argument === "string")) {
    throw new Error("Invalid media conversion arguments.");
  }
  const safeInput = /^[a-z0-9]{1,8}$/i.test(inputExtension) ? inputExtension : "bin";
  const safeOutput = /^[a-z0-9]{1,8}$/i.test(outputExtension) ? outputExtension : "bin";
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-convert-"));
  const input = path.join(directory, `input.${safeInput}`);
  const output = path.join(directory, `output.${safeOutput}`);
  try {
    await fs.promises.writeFile(input, buffer, { mode: 0o600 });
    await execFileAsync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-i", input, ...args, output], {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    });
    const result = await fs.promises.readFile(output);
    if (!result.length || result.length > maximumBytes) throw new Error("Converted media exceeds the configured size limit.");
    return result;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("This conversion needs FFmpeg. Use the included Docker image or install FFmpeg.");
    }
    throw error;
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

export async function videoToSticker(buffer) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-"));
  const input = path.join(directory, "input.mp4");
  const output = path.join(directory, "output.webp");
  try {
    await fs.promises.writeFile(input, buffer, { mode: 0o600 });
    await execFileAsync(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-y",
        "-i",
        input,
        "-t",
        "8",
        "-vf",
        "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
        "-loop",
        "0",
        "-an",
        "-vcodec",
        "libwebp",
        output,
      ],
      { timeout: 90_000, maxBuffer: 1024 * 1024 },
    );
    return await fs.promises.readFile(output);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Video stickers need FFmpeg. Use the included Docker image or install FFmpeg.");
    }
    throw error;
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

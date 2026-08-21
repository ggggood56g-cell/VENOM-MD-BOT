import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileTypeFromBuffer } from "file-type";
import webpMux from "node-webpmux";
import sharp from "sharp";
import { ffmpeg } from "./File-Converter.js";
import { assertPublicHttpUrl, publicHttp } from "../src/lib/network.js";

const { Image: WebpImage } = webpMux;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredLimitMb = Number.parseInt(process.env.MEDIA_MAX_MB || "64", 10);
const MAX_INPUT_BYTES =
  (Number.isFinite(configuredLimitMb) && configuredLimitMb > 0
    ? configuredLimitMb
    : 64) *
  1024 *
  1024;

export const StickerTypes = Object.freeze({
  DEFAULT: "default",
  CROPPED: "crop",
  FULL: "full",
  CIRCLE: "circle",
  ROUNDED: "rounded",
});

const validTypes = new Set(Object.values(StickerTypes));

export class Sticker {
  constructor(data, options = {}) {
    this.data = data;
    this.options = {
      pack: cleanMetadata(options.pack, 128),
      author: cleanMetadata(options.author, 128),
      id: cleanMetadata(options.id, 128) || randomUUID(),
      categories: Array.isArray(options.categories)
        ? options.categories.slice(0, 10).map((value) => cleanMetadata(value, 16))
        : [],
      quality: Math.max(1, Math.min(100, Number(options.quality) || 80)),
      background: cleanMetadata(options.background, 64) || "transparent",
      type: validTypes.has(options.type) ? options.type : StickerTypes.DEFAULT,
    };
  }

  async build() {
    const input = await loadInput(this.data);
    const detected = await fileTypeFromBuffer(input);
    const isSvg = !detected && input.subarray(0, 512).toString("utf8").includes("<svg");
    if (!detected && !isSvg) throw new Error("Unsupported sticker media type.");

    const mime = detected?.mime || "image/svg+xml";
    const converted = mime.startsWith("video/")
      ? await convertVideo(input, detected?.ext || "mp4", this.options)
      : await convertImage(input, this.options);
    return addStickerMetadata(converted, this.options);
  }

  toBuffer() {
    return this.build();
  }

  async toFile(filename) {
    const resolved = resolveRepositoryPath(filename);
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, await this.build(), { mode: 0o600 });
    return resolved;
  }
}

export const createSticker = async (data, options) => new Sticker(data, options).build();

async function loadInput(data) {
  if (Buffer.isBuffer(data)) {
    if (data.length === 0 || data.length > MAX_INPUT_BYTES) {
      throw new Error("Sticker input is empty or exceeds the configured media limit.");
    }
    return data;
  }
  if (typeof data !== "string" || data.length === 0) {
    throw new TypeError("Sticker input must be a buffer, local path, HTTPS URL, or SVG.");
  }
  if (data.trimStart().startsWith("<svg")) {
    const buffer = Buffer.from(data);
    if (buffer.length > 1024 * 1024) throw new Error("SVG sticker input is too large.");
    return buffer;
  }
  if (data.startsWith("data:")) {
    const comma = data.indexOf(",");
    if (comma < 0 || !data.slice(0, comma).includes(";base64")) {
      throw new Error("Only base64 data URLs are supported for stickers.");
    }
    return loadInput(Buffer.from(data.slice(comma + 1), "base64"));
  }
  if (/^https?:\/\//i.test(data)) return downloadRemoteMedia(data);

  const resolved = resolveRepositoryPath(data);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_INPUT_BYTES) {
    throw new Error("Sticker file is empty or exceeds the configured media limit.");
  }
  return fs.promises.readFile(resolved);
}

export async function downloadRemoteMedia(value, { maxBytes = MAX_INPUT_BYTES } = {}) {
  const byteLimit = Math.max(
    1,
    Math.min(MAX_INPUT_BYTES, Number.parseInt(maxBytes, 10) || MAX_INPUT_BYTES),
  );
  let url = new URL(value);
  let response;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await validateRemoteUrl(url);
    response = await publicHttp.get(url.href, {
      timeout: 20_000,
      maxRedirects: 0,
      maxContentLength: byteLimit,
      responseType: "arraybuffer",
      headers: { accept: "image/*,video/*;q=0.8" },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    if (response.status < 300) break;

    const location = response.headers.location;
    if (!location || redirectCount === 3) {
      throw new Error("Sticker URL redirected too many times.");
    }
    url = new URL(location, url);
  }
  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`Sticker server returned HTTP ${response?.status || "unknown"}.`);
  }

  const buffer = Buffer.from(response.data || []);
  if (buffer.length === 0) throw new Error("Remote sticker was empty.");
  if (buffer.length > byteLimit) {
    throw new Error("Remote sticker exceeds the configured media limit.");
  }
  return buffer;
}

async function validateRemoteUrl(url) {
  if (url.protocol !== "https:") throw new Error("Sticker URLs must use HTTPS.");
  if (url.username || url.password || url.port) {
    throw new Error("Sticker URLs cannot contain credentials or custom ports.");
  }
  try {
    await assertPublicHttpUrl(url);
  } catch {
    throw new Error("Private network sticker URLs are not allowed.");
  }
}

async function convertImage(input, options) {
  const image = sharp(input, {
    animated: true,
    failOn: "error",
    limitInputPixels: 4096 * 4096,
  });
  applyResize(image, options);
  return image.webp({ quality: options.quality, effort: 4 }).toBuffer();
}

async function convertVideo(input, extension, options) {
  const crop = options.type === StickerTypes.CROPPED;
  const resizeFilter = crop
    ? "scale=512:512:force_original_aspect_ratio=increase,crop=512:512"
    : "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000";
  return ffmpeg(
    input,
    [
      "-t",
      "15",
      "-vf",
      `fps=15,${resizeFilter}`,
      "-an",
      "-loop",
      "0",
      "-c:v",
      "libwebp",
      "-quality",
      String(options.quality),
      "-preset",
      "picture",
      "-f",
      "webp",
    ],
    extension,
    "webp",
  );
}

function applyResize(image, options) {
  if (options.type === StickerTypes.CROPPED) {
    image.resize(512, 512, { fit: "cover" });
  } else if (options.type === StickerTypes.CIRCLE) {
    image.resize(512, 512, { fit: "cover" }).composite([
      {
        input: Buffer.from(
          '<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>',
        ),
        blend: "dest-in",
      },
    ]);
  } else if (options.type === StickerTypes.ROUNDED) {
    image.resize(512, 512, { fit: "cover" }).composite([
      {
        input: Buffer.from(
          '<svg width="512" height="512"><rect width="512" height="512" rx="50" ry="50" fill="white"/></svg>',
        ),
        blend: "dest-in",
      },
    ]);
  } else {
    image.resize(512, 512, {
      fit: "contain",
      background: options.background,
    });
  }
}

async function addStickerMetadata(buffer, options) {
  const metadata = {
    "sticker-pack-id": options.id,
    "sticker-pack-name": options.pack,
    "sticker-pack-publisher": options.author,
    emojis: options.categories,
  };
  const json = Buffer.from(JSON.stringify(metadata), "utf8");
  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
      0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]),
    json,
  ]);
  exif.writeUInt32LE(json.length, 14);

  const image = new WebpImage();
  await image.load(buffer);
  image.exif = exif;
  return image.save(null);
}

function resolveRepositoryPath(value) {
  const resolved = path.resolve(repositoryRoot, String(value));
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Sticker path must stay inside the bot directory.");
  }
  return resolved;
}

function cleanMetadata(value, maximumLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maximumLength);
}

export default { Sticker, StickerTypes, createSticker };

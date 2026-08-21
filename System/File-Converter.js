import { randomBytes } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "Cache");

function isExecutableFile(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  try {
    const accessMode =
      process.platform === "win32"
        ? fs.constants.F_OK
        : fs.constants.F_OK | fs.constants.X_OK;
    fs.accessSync(candidate, accessMode);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function executableNames(candidate) {
  if (process.platform !== "win32" || path.extname(candidate)) return [candidate];
  const extensions = String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  return [candidate, ...extensions.map((extension) => `${candidate}${extension}`)];
}

function resolveCandidate(candidate, cwd, pathValue) {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  const value = candidate.trim();
  if (path.isAbsolute(value) || value.includes("/") || value.includes("\\")) {
    const resolved = path.isAbsolute(value) ? value : path.resolve(cwd, value);
    return executableNames(resolved).find(isExecutableFile) || null;
  }
  for (const directory of String(pathValue || "").split(path.delimiter)) {
    if (!directory) continue;
    const found = executableNames(path.join(directory, value)).find(isExecutableFile);
    if (found) return found;
  }
  return null;
}

export function resolveFfmpegPath({
  configuredPath = process.env.FFMPEG_PATH,
  staticPath = ffmpegStatic,
  pathValue = process.env.PATH,
  cwd = process.cwd(),
} = {}) {
  for (const candidate of [configuredPath, staticPath, "ffmpeg"]) {
    const resolved = resolveCandidate(candidate, cwd, pathValue);
    if (resolved) return resolved;
  }
  return null;
}

export const FFMPEG_PATH = resolveFfmpegPath();
// Retain a command-name fallback so platforms can provision FFmpeg after startup.
export const ffmpegBinary = FFMPEG_PATH || "ffmpeg";

const safeExtension = (value, fallback) => {
  const extension = String(value || "").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : fallback;
};

async function ffmpeg(buffer, args = [], extension = "bin", outputExtension = "bin") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TypeError("FFmpeg input must be a non-empty buffer.");
  }
  if (!Array.isArray(args) || !args.every((argument) => typeof argument === "string")) {
    throw new TypeError("FFmpeg arguments must be an array of strings.");
  }

  await fs.promises.mkdir(cacheDir, { recursive: true });
  const id = `${Date.now()}-${randomBytes(8).toString("hex")}`;
  const inputPath = path.join(cacheDir, `${id}.${safeExtension(extension, "bin")}`);
  const outputPath = path.join(
    cacheDir,
    `${id}.output.${safeExtension(outputExtension, "bin")}`,
  );

  try {
    await fs.promises.writeFile(inputPath, buffer, { mode: 0o600 });
    await execFileAsync(
      ffmpegBinary,
      ["-y", "-i", inputPath, ...args, outputPath],
      { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
    return await fs.promises.readFile(outputPath);
  } finally {
    await Promise.all([
      fs.promises.unlink(inputPath).catch(() => {}),
      fs.promises.unlink(outputPath).catch(() => {}),
    ]);
  }
}

/** Convert audio/video to an MP3 buffer suitable for WhatsApp. */
function toAudio(buffer, extension) {
  return ffmpeg(
    buffer,
    ["-vn", "-ac", "2", "-b:a", "128k", "-ar", "44100", "-f", "mp3"],
    extension,
    "mp3",
  );
}

/** Convert audio/video to an Opus push-to-talk buffer. */
function toPTT(buffer, extension) {
  return ffmpeg(
    buffer,
    [
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      "128k",
      "-vbr",
      "on",
      "-compression_level",
      "10",
    ],
    extension,
    "opus",
  );
}

/** Convert media to an H.264/AAC MP4 buffer. */
function toVideo(buffer, extension) {
  return ffmpeg(
    buffer,
    [
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-ab",
      "128k",
      "-ar",
      "44100",
      "-crf",
      "32",
      "-preset",
      "slow",
    ],
    extension,
    "mp4",
  );
}

export { toAudio, toPTT, toVideo, ffmpeg };
export default { toAudio, toPTT, toVideo, ffmpeg };

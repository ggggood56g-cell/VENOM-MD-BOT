import { getContentType } from "baileys";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { downloadMedia, mediaMessage, unwrapMessage } from "../message.js";
import {
  addStickerMetadata,
  ffmpegConvert,
  imageToSticker,
  stickerToImage,
} from "../services/media.js";

function mediaType(raw) {
  return getContentType(unwrapMessage(raw?.message));
}

async function source(context, accepted) {
  const target = mediaMessage(context.details);
  const type = mediaType(target);
  if (!accepted.includes(type)) throw new Error(`Send or reply to: ${accepted.map((name) => name.replace("Message", "")).join(", ")}.`);
  const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
  const detected = await fileTypeFromBuffer(buffer);
  return { buffer, type, extension: detected?.ext || "bin", mimetype: detected?.mime || "application/octet-stream" };
}

const AUDIO_EFFECTS = {
  bass: "equalizer=f=60:width_type=o:width=2:g=18",
  blown: "acrusher=bits=6:mix=0.7",
  chipmunk: "asetrate=44100*1.25,aresample=44100,atempo=0.8",
  deep: "asetrate=44100*0.8,aresample=44100,atempo=1.25",
  earrape: "volume=10,alimiter=limit=0.95",
  echo: "aecho=0.8:0.88:60:0.4",
  fast: "atempo=1.5",
  fat: "asetrate=44100*0.88,aresample=44100",
  flanger: "flanger",
  nightcore: "asetrate=48000,aresample=44100,atempo=0.92",
  reverse: "areverse",
  robot: "tremolo=f=28:d=0.85",
  slow: "atempo=0.75",
  squirrel: "asetrate=44100*1.45,aresample=44100,atempo=0.7",
  tremolo: "tremolo=f=8:d=0.8",
  vibrato: "vibrato=f=7:d=0.7",
};

const audioCommands = Object.entries(AUDIO_EFFECTS).map(([name, filter]) => ({
  name,
  category: "converter",
  description: `Apply the ${name} effect to replied audio or video audio.`,
  usage: `${name} (reply to audio/video)`,
  async execute(context) {
    const input = await source(context, ["audioMessage", "videoMessage"]);
    await context.reply(`🎛️ Applying ${name} effect...`);
    const audio = await ffmpegConvert(
      input.buffer,
      ["-vn", "-af", filter, "-c:a", "libmp3lame", "-b:a", "160k"],
      {
        inputExtension: input.extension,
        outputExtension: "mp3",
        maximumBytes: context.config.maxMediaBytes,
      },
    );
    await context.send({ audio, mimetype: "audio/mpeg", fileName: `${name}.mp3` });
  },
}));

const videoEffects = {
  vidfast: ["-vf", "setpts=0.5*PTS", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
  vidreverse: ["-vf", "reverse", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
  vidslow: ["-vf", "setpts=2.0*PTS", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
  boomerang: [
    "-filter_complex",
    "[0:v]split[v1][v2];[v2]reverse[rv];[v1][rv]concat=n=2:v=1:a=0[outv]",
    "-map",
    "[outv]",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ],
};

export default [
  ...audioCommands,
  {
    name: "tomp3",
    category: "converter",
    description: "Convert audio or video audio to MP3.",
    async execute(context) {
      const input = await source(context, ["audioMessage", "videoMessage"]);
      const audio = await ffmpegConvert(input.buffer, ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"], {
        inputExtension: input.extension,
        outputExtension: "mp3",
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ audio, mimetype: "audio/mpeg", fileName: "VENOM-audio.mp3" });
    },
  },
  ...["tovn", "tovv"].map((name) => ({
    name,
    category: "converter",
    description: "Convert audio to a WhatsApp voice note.",
    async execute(context) {
      const input = await source(context, ["audioMessage", "videoMessage"]);
      const audio = await ffmpegConvert(input.buffer, ["-vn", "-c:a", "libopus", "-b:a", "96k"], {
        inputExtension: input.extension,
        outputExtension: "ogg",
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ audio, mimetype: "audio/ogg; codecs=opus", ptt: true });
    },
  })),
  {
    name: "mp4",
    category: "converter",
    description: "Convert a video or animated sticker to MP4.",
    async execute(context) {
      const input = await source(context, ["videoMessage", "stickerMessage"]);
      const video = await ffmpegConvert(input.buffer, ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"], {
        inputExtension: input.extension,
        outputExtension: "mp4",
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ video, mimetype: "video/mp4", caption: "Converted by VENOM MD" });
    },
  },
  {
    name: "gif",
    category: "converter",
    description: "Convert a short video to a looping WhatsApp GIF.",
    async execute(context) {
      const input = await source(context, ["videoMessage"]);
      const video = await ffmpegConvert(input.buffer, ["-t", "12", "-vf", "scale=480:-2,fps=15", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"], {
        inputExtension: input.extension,
        outputExtension: "mp4",
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ video, mimetype: "video/mp4", gifPlayback: true });
    },
  },
  {
    name: "photo",
    category: "converter",
    description: "Convert a sticker to a PNG photo.",
    async execute(context) {
      const input = await source(context, ["stickerMessage"]);
      await context.send({ image: await stickerToImage(input.buffer), caption: "Converted by VENOM MD" });
    },
  },
  ...["circlestk", "roundstk"].map((name) => ({
    name,
    category: "converter",
    description: "Create a circular branded sticker.",
    async execute(context) {
      const input = await source(context, ["imageMessage", "stickerMessage"]);
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="250" fill="white"/></svg>');
      const webp = await sharp(input.buffer)
        .resize(512, 512, { fit: "cover" })
        .composite([{ input: mask, blend: "dest-in" }])
        .webp({ quality: 84 })
        .toBuffer();
      await context.send({ sticker: await addStickerMetadata(webp, context.config.packname, context.config.author) });
    },
  })),
  ...["black", "white"].map((name) => ({
    name,
    category: "converter",
    description: `Create a sticker with a ${name} background.`,
    async execute(context) {
      const input = await source(context, ["imageMessage", "stickerMessage"]);
      const webp = await sharp(input.buffer, { animated: true })
        .resize(512, 512, { fit: "contain", background: name })
        .flatten({ background: name })
        .webp({ quality: 84 })
        .toBuffer();
      await context.send({ sticker: await addStickerMetadata(webp, context.config.packname, context.config.author) });
    },
  })),
  {
    name: "take",
    aliases: ["exif"],
    category: "converter",
    description: "Apply custom pack metadata to a replied sticker or image.",
    usage: "take Pack Name | Author",
    async execute(context) {
      const input = await source(context, ["imageMessage", "stickerMessage"]);
      const [pack, author] = context.query.split("|").map((value) => value.trim());
      const webp = input.type === "stickerMessage" ? input.buffer : await imageToSticker(input.buffer);
      const sticker = await addStickerMetadata(
        webp,
        pack || context.config.packname,
        author || context.config.author,
      );
      await context.send({ sticker });
    },
  },
  ...Object.entries(videoEffects).map(([name, args]) => ({
    name,
    category: "converter",
    description: `Apply the ${name} video effect.`,
    async execute(context) {
      const input = await source(context, ["videoMessage"]);
      await context.reply(`🎬 Applying ${name}...`);
      const video = await ffmpegConvert(input.buffer, args, {
        inputExtension: input.extension,
        outputExtension: "mp4",
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ video, mimetype: "video/mp4", caption: `${name} • VENOM MD` });
    },
  })),
  {
    name: "capcut",
    category: "converter",
    description: "Apply a quick CapCut-style polish to a short video.",
    usage: "capcut (reply to video)",
    async execute(context) {
      const input = await source(context, ["videoMessage"]);
      await context.reply("✨ Applying capcut polish...");
      const video = await ffmpegConvert(
        input.buffer,
        ["-vf", "eq=contrast=1.08:brightness=0.04:saturation=1.15,unsharp=5:5:0.8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an"],
        {
          inputExtension: input.extension,
          outputExtension: "mp4",
          maximumBytes: context.config.maxMediaBytes,
        },
      );
      await context.send({ video, mimetype: "video/mp4", caption: "✨ capcut polish • VENOM MD" });
    },
  },
];

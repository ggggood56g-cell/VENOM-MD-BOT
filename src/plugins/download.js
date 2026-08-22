import { translate } from "@vitalets/google-translate-api";

import { synthesizeSpeech } from "../services/tts.js";
import { downloadYouTube, searchYouTube } from "../services/youtube.js";

function safeFilename(value, extension) {
  const base = String(value || "download")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .trim()
    .slice(0, 80) || "download";
  return `${base}.${extension}`;
}

export default [
  {
    name: "ytsearch",
    aliases: ["yts"],
    category: "download",
    description: "Search YouTube and show the top results.",
    usage: "ytsearch <query>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a YouTube search query.");
      const results = await searchYouTube(context.query, 5);
      if (!results.length) throw new Error("No results found.");
      await context.reply(
        ["🔎 *YouTube results*", "", ...results.flatMap((item, index) => [
          `${index + 1}. *${item.title}*`,
          `${item.author} • ${item.duration} • ${item.views.toLocaleString()} views`,
          item.url,
          "",
        ])].join("\n").trim(),
      );
    },
  },
  {
    name: "song",
    aliases: ["play", "yta"],
    category: "download",
    description: "Search for or download YouTube audio.",
    usage: "song <query or YouTube URL>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a song name or YouTube URL.");
      await context.reply("⏳ Preparing audio...");
      const result = await downloadYouTube(context.query, "audio", context.config.maxMediaBytes);
      await context.send({
        audio: result.buffer,
        mimetype: result.mimetype,
        fileName: safeFilename(result.title, "m4a"),
      });
    },
  },
  {
    name: "video",
    aliases: ["ytv"],
    category: "download",
    description: "Search for or download a small YouTube video.",
    usage: "video <query or YouTube URL>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a video name or YouTube URL.");
      await context.reply("⏳ Preparing video...");
      const result = await downloadYouTube(context.query, "video", context.config.maxMediaBytes);
      await context.send({
        video: result.buffer,
        mimetype: result.mimetype,
        fileName: safeFilename(result.title, "mp4"),
        caption: result.title,
      });
    },
  },
  {
    name: "translate",
    aliases: ["trt"],
    category: "download",
    description: "Translate text into another language.",
    usage: "translate <language code> <text>",
    async execute(context) {
      const language = context.args.shift();
      const text = context.args.join(" ");
      if (!language || !text) throw new Error(`Example: ${context.prefix}translate fr Good morning`);
      const result = await translate(text.slice(0, 2_000), { to: language.slice(0, 10) });
      await context.reply(`🌍 *Translation (${language})*\n${result.text}`);
    },
  },
  {
    name: "tts",
    category: "download",
    description: "Turn short text into speech.",
    usage: "tts [language] <text>",
    async execute(context) {
      if (!context.query) throw new Error(`Example: ${context.prefix}tts en Welcome to VENOM`);
      const possibleLanguage = context.args[0];
      const hasLanguage = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(possibleLanguage || "");
      const language = hasLanguage ? context.args.shift() : "en";
      const text = context.args.join(" ").slice(0, 200);
      if (!text) throw new Error("Enter text to speak.");
      const audio = await synthesizeSpeech(text, language);
      await context.send({ audio, mimetype: "audio/mpeg", ptt: true });
    },
  },
];

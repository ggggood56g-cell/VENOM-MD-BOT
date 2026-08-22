import { getContentType } from "baileys";
import ytdl from "@distube/ytdl-core";
import jsQR from "jsqr";
import PDFDocument from "pdfkit";
import sharp from "sharp";

import { downloadMedia, mediaMessage, unwrapMessage } from "../message.js";
import { fetchBuffer, fetchJson } from "../services/http.js";
import { ffmpegConvert } from "../services/media.js";
import { synthesizeSpeech } from "../services/tts.js";
import { renderTextStyle } from "../services/textmaker.js";
import { downloadYouTube, searchYouTube } from "../services/youtube.js";
import { sleep } from "../utils.js";

function safeFilename(value, extension) {
  const name = String(value || "VENOM-download")
    .replace(/[^A-Za-z0-9 _.-]/g, "")
    .trim()
    .slice(0, 80) || "VENOM-download";
  return `${name}.${extension}`;
}

async function sourceMedia(context, accepted = []) {
  const target = mediaMessage(context.details);
  const type = getContentType(unwrapMessage(target?.message));
  if (!target || (accepted.length && !accepted.includes(type))) {
    throw new Error("Send or reply to supported media.");
  }
  return {
    target,
    type,
    buffer: await downloadMedia(context.socket, target, context.config.maxMediaBytes),
  };
}

async function pdfBuffer(text, title) {
  const document = new PDFDocument({ size: "A4", margin: 54, info: { Title: title, Author: "VENOM MD BOT" } });
  const chunks = [];
  document.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    document.once("end", () => resolve(Buffer.concat(chunks)));
    document.once("error", reject);
  });
  document.fontSize(20).text(title, { align: "center" }).moveDown();
  document.fontSize(11).text(text, { align: "left", lineGap: 4 });
  document.end();
  return completed;
}

function decodeXml(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export default [
  {
    name: "ytinfo",
    category: "download",
    description: "Show detailed information for a YouTube URL.",
    usage: "ytinfo <YouTube URL>",
    async execute(context) {
      if (!ytdl.validateURL(context.query)) throw new Error("Enter a valid YouTube video URL.");
      const info = await ytdl.getInfo(context.query);
      const video = info.videoDetails;
      await context.reply(`▶️ *${video.title}*\nChannel: ${video.author?.name || "Unknown"}\nDuration: ${Math.floor(Number(video.lengthSeconds) / 60)}m ${Number(video.lengthSeconds) % 60}s\nViews: ${Number(video.viewCount).toLocaleString()}\nPublished: ${video.publishDate || "Unknown"}\n${video.video_url}`);
    },
  },
  {
    name: "ytstatus",
    category: "download",
    description: "Test the YouTube search provider.",
    async execute(context) {
      const results = await searchYouTube("VENOM MD music", 1);
      await context.reply(results.length ? "✅ YouTube search provider is responding." : "⚠️ YouTube responded but returned no result.");
    },
  },
  {
    name: "playdoc",
    category: "download",
    description: "Download YouTube audio as a document.",
    usage: "playdoc <query or URL>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a song query or YouTube URL.");
      const result = await downloadYouTube(context.query, "audio", context.config.maxMediaBytes);
      await context.send({ document: result.buffer, mimetype: result.mimetype, fileName: safeFilename(result.title, "m4a") });
    },
  },
  {
    name: "videodoc",
    category: "download",
    description: "Download a small YouTube video as a document.",
    usage: "videodoc <query or URL>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a video query or YouTube URL.");
      const result = await downloadYouTube(context.query, "video", context.config.maxMediaBytes);
      await context.send({ document: result.buffer, mimetype: result.mimetype, fileName: safeFilename(result.title, "mp4") });
    },
  },
  {
    name: "autodl",
    category: "download",
    description: "Automatically download YouTube audio or video.",
    usage: "autodl audio|video <query or URL>",
    async execute(context) {
      const type = context.args.shift()?.toLowerCase();
      if (!["audio", "video"].includes(type)) throw new Error("Choose audio or video first.");
      const request = context.args.join(" ");
      const result = await downloadYouTube(request, type, context.config.maxMediaBytes);
      await context.send(type === "audio"
        ? { audio: result.buffer, mimetype: result.mimetype, fileName: safeFilename(result.title, "m4a") }
        : { video: result.buffer, mimetype: result.mimetype, caption: result.title });
    },
  },
  {
    name: "gitclone",
    category: "download",
    description: "Download a public GitHub repository ZIP.",
    usage: "gitclone owner/repository",
    async execute(context) {
      const repo = context.query.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Enter owner/repository or a GitHub repository URL.");
      const metadata = await fetchJson(`https://api.github.com/repos/${repo}`, {
        allowedHosts: ["api.github.com"], maximumBytes: 512 * 1024,
        headers: { accept: "application/vnd.github+json" },
      });
      const branch = String(metadata.default_branch || "main").replace(/[^A-Za-z0-9._/-]/g, "");
      const url = `https://codeload.github.com/${repo}/zip/refs/heads/${branch}`;
      const { buffer } = await fetchBuffer(url, {
        allowedHosts: ["codeload.github.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 30_000,
      });
      await context.send({ document: buffer, mimetype: "application/zip", fileName: `${repo.replace("/", "-")}.zip` });
    },
  },
  {
    name: "gdrive",
    category: "download",
    description: "Download a publicly shared Google Drive file.",
    usage: "gdrive <public Drive URL>",
    async execute(context) {
      const id = context.query.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1]
        || context.query.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1];
      if (!id) throw new Error("Enter a public Google Drive file URL.");
      const { buffer, contentType } = await fetchBuffer(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, {
        allowedHosts: ["drive.usercontent.google.com", "googleusercontent.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 30_000,
      });
      if (contentType.includes("text/html")) throw new Error("Google Drive requires additional permission or confirmation for this file.");
      await context.send({ document: buffer, mimetype: contentType.split(";")[0], fileName: `gdrive-${id.slice(0, 8)}.bin` });
    },
  },
  {
    name: "spotifyinfo",
    category: "download",
    description: "Show public Spotify track, album or playlist information.",
    usage: "spotifyinfo <Spotify URL>",
    async execute(context) {
      if (!/^https:\/\/open\.spotify\.com\//i.test(context.query)) throw new Error("Enter a public Spotify URL.");
      const payload = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(context.query)}`, {
        allowedHosts: ["open.spotify.com"], maximumBytes: 512 * 1024,
      });
      await context.reply(`🎧 *${payload.title || "Spotify"}*\nProvider: ${payload.provider_name || "Spotify"}\n${context.query}`);
    },
  },
  {
    name: "dlstatus",
    category: "download",
    description: "Show the status of built-in download providers.",
    async execute(context) {
      await context.reply("📥 *DOWNLOAD PROVIDERS*\n• YouTube: built in\n• GitHub: built in\n• Google Drive: public files\n• Spotify: public metadata\n\nAvailability can depend on the host network and source service.");
    },
  },
  {
    name: "doc",
    category: "converter",
    description: "Resend replied media as a document.",
    async execute(context) {
      const source = await sourceMedia(context);
      await context.send({ document: source.buffer, mimetype: "application/octet-stream", fileName: `VENOM-${Date.now()}.bin` });
    },
  },
  {
    name: "ptv",
    category: "converter",
    description: "Resend a replied video as a video note.",
    async execute(context) {
      const source = await sourceMedia(context, ["videoMessage"]);
      await context.send({ video: source.buffer, ptv: true });
    },
  },
  {
    name: "smooth",
    category: "converter",
    description: "Apply frame interpolation and smoothing to a short video.",
    async execute(context) {
      const source = await sourceMedia(context, ["videoMessage"]);
      const video = await ffmpegConvert(source.buffer, ["-vf", "minterpolate=fps=30:mi_mode=mci,scale='min(720,iw)':-2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"], {
        inputExtension: "mp4", outputExtension: "mp4", maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ video, mimetype: "video/mp4", caption: "Smooth • VENOM MD" });
    },
  },
  {
    name: "aitts",
    category: "converter",
    description: "Generate a clear text-to-speech voice note.",
    usage: "aitts <text>",
    async execute(context) {
      if (!context.query || context.query.length > 200) throw new Error("Enter 1–200 characters.");
      const audio = await synthesizeSpeech(context.query, "en");
      await context.send({ audio, mimetype: "audio/mpeg", ptt: true });
    },
  },
  {
    name: "dbkeep",
    category: "bot",
    description: "Persist the current state immediately (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.store.save();
      if (context.runtime.database.collection("auth_sessions")) await context.runtime.authStore.backupNow();
      await context.reply("✅ Current state saved.");
    },
  },
  {
    name: "dbclean",
    ownerStrict: true,
    category: "bot",
    description: "Remove expired local runtime records (owner only).",
    ownerOnly: true,
    async execute(context) {
      const removed = await context.store.cleanRuntimeData();
      await context.reply(`🧹 Runtime cleanup complete. Removed ${removed} stale record(s).`);
    },
  },
  {
    name: "broadcast",
    category: "bot",
    description: "Send an owner-confirmed notice to joined groups with safe pacing.",
    usage: "broadcast CONFIRM | message",
    ownerOnly: true,
    async execute(context) {
      const [confirmation, ...parts] = context.query.split("|").map((value) => value.trim());
      const text = parts.join(" | ");
      if (confirmation !== "CONFIRM" || !text || text.length > 2_000) {
        throw new Error(`Use: ${context.prefix}broadcast CONFIRM | message`);
      }
      const groups = Object.keys(await context.socket.groupFetchAllParticipating()).slice(0, 100);
      let sent = 0;
      for (const jid of groups) {
        if (await context.socket.sendMessage(jid, { text: `📢 *${context.config.botName}*\n\n${text}` }).then(() => true).catch(() => false)) sent += 1;
        await sleep(500);
      }
      await context.reply(`✅ Broadcast delivered to ${sent}/${groups.length} groups.`);
    },
  },
  {
    name: "tinyurl",
    category: "utility",
    description: "Shorten a public HTTP or HTTPS URL.",
    usage: "tinyurl https://example.com/page",
    async execute(context) {
      let target;
      try { target = new URL(context.query); } catch { throw new Error("Enter a valid URL."); }
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Only public HTTP(S) URLs without credentials are accepted.");
      const { buffer } = await fetchBuffer(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(target.toString())}`, {
        allowedHosts: ["tinyurl.com"], maximumBytes: 8 * 1024,
      });
      await context.reply(`🔗 ${buffer.toString("utf8").trim()}`);
    },
  },
  {
    name: "readqr",
    category: "utility",
    description: "Decode a QR code from a replied image.",
    async execute(context) {
      const source = await sourceMedia(context, ["imageMessage"]);
      const { data, info } = await sharp(source.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      if (!result?.data) throw new Error("No readable QR code was found.");
      await context.reply(`🔍 *QR CONTENT*\n${result.data.slice(0, 4_000)}`);
    },
  },
  {
    name: "pdf",
    category: "utility",
    description: "Create a PDF document from text.",
    usage: "pdf <text>",
    async execute(context) {
      if (!context.query || context.query.length > 20_000) throw new Error("Enter 1–20,000 characters.");
      const document = await pdfBuffer(context.query, "VENOM MD Document");
      await context.send({ document, mimetype: "application/pdf", fileName: `VENOM-${Date.now()}.pdf` });
    },
  },
  {
    name: "imagine",
    category: "ai",
    description: "Create an original conceptual poster from a prompt locally.",
    usage: "imagine <prompt>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a poster prompt.");
      const image = await renderTextStyle(context.query, "galaxy", { square: true });
      await context.send({ image, caption: "✨ VENOM IMAGINE • locally generated concept poster" });
    },
  },
  {
    name: "news",
    category: "search",
    description: "Search current Google News RSS headlines.",
    usage: "news <topic>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a news topic.");
      const { buffer } = await fetchBuffer(`https://news.google.com/rss/search?q=${encodeURIComponent(context.query)}&hl=en-NG&gl=NG&ceid=NG:en`, {
        allowedHosts: ["news.google.com"], maximumBytes: 2 * 1024 * 1024,
      });
      const xml = buffer.toString("utf8");
      const items = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g)]
        .slice(0, 8)
        .map((match) => ({ title: decodeXml(match[1]), link: decodeXml(match[2]), date: decodeXml(match[3]) }));
      if (!items.length) throw new Error("No current headlines were found.");
      await context.reply(`📰 *NEWS: ${context.query}*\n\n${items.map((item, index) => `${index + 1}. *${item.title}*\n${item.date}\n${item.link}`).join("\n\n")}`);
    },
  },
];

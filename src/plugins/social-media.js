import { fileTypeFromBuffer } from "file-type";

import { fetchBuffer, fetchJson, postForm } from "../services/http.js";
import { downloadYouTube, searchYouTube } from "../services/youtube.js";

const TIKWM = "https://www.tikwm.com/api/";

function requireUrl(context) {
  const url = (context.query.match(/https?:\/\/\S+/) || [])[0];
  if (!url) throw new Error("Send a supported link with the command.");
  return url.slice(0, 500);
}

function safeName(value) {
  return String(value || "VENOM")
    .replace(/[\\/*?:"<>|\n\r]+/g, " ")
    .trim()
    .slice(0, 60) || "VENOM";
}

async function sendAudioFromUrl(context, url, title) {
  const { buffer, contentType } = await fetchBuffer(url, {
    allowedHosts: ["tikwm.com", "tiktokcdn.com", "tiktokcdn-us.com"],
    maximumBytes: context.config.maxMediaBytes,
    timeout: 30_000,
  });
  const detected = await fileTypeFromBuffer(buffer).catch(() => null);
  await context.send({
    audio: buffer,
    mimetype: detected?.mime || contentType.split(";")[0] || "audio/mpeg",
    fileName: `${safeName(title)}.mp3`,
  });
}

async function tikwm(context, url) {
  const payload = await fetchJson(`${TIKWM}?url=${encodeURIComponent(url)}&hd=1`, {
    allowedHosts: ["tikwm.com"],
    maximumBytes: 1024 * 1024,
    timeout: 25_000,
  });
  if (payload.code !== 0 || !payload.data) {
    throw new Error(String(payload.msg || "TikTok could not process that link."));
  }
  return payload.data;
}

function tikwmMediaUrl(value) {
  if (!value) return "";
  return value.startsWith("http") ? value : `https://www.tikwm.com${value}`;
}

export default [
  {
    name: "tiktok",
    category: "download",
    description: "Download a TikTok video without watermark.",
    usage: "tiktok <TikTok link>",
    async execute(context) {
      const url = requireUrl(context);
      await context.reply("⏳ Fetching TikTok video...");
      const data = await tikwm(context, url);
      const video = tikwmMediaUrl(data.play || data.wmplay);
      if (!video) throw new Error("No downloadable video found in that link.");
      const { buffer } = await fetchBuffer(video, {
        allowedHosts: ["tikwm.com", "tiktokcdn.com", "tiktokcdn-us.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 60_000,
      });
      await context.send({
        video: buffer,
        mimetype: "video/mp4",
        fileName: `${safeName(data.title)}.mp4`,
        caption: `🎬 *${data.title || "TikTok"}*\n@${data.author?.unique_id || "unknown"} • ❤️ ${(data.digg_count || 0).toLocaleString()}`,
      });
    },
  },
  {
    name: "tik-img",
    category: "download",
    description: "Download TikTok photo post images.",
    usage: "tik-img <TikTok photo link>",
    async execute(context) {
      const url = requireUrl(context);
      await context.reply("⏳ Fetching TikTok images...");
      const data = await tikwm(context, url);
      const images = data.images || [];
      if (!images.length) throw new Error("That link has no photo slides.");
      for (const image of images.slice(0, 12)) {
        const { buffer } = await fetchBuffer(tikwmMediaUrl(image), {
          allowedHosts: ["tikwm.com", "tiktokcdn.com", "tiktokcdn-us.com"],
          maximumBytes: context.config.maxMediaBytes,
          timeout: 30_000,
        });
        await context.send({ image: buffer });
      }
      await context.reply(`✅ Sent ${Math.min(images.length, 12)} photo(s).`);
    },
  },
  {
    name: "ttmp3",
    category: "download",
    description: "Download TikTok sound as audio.",
    usage: "ttmp3 <TikTok link>",
    async execute(context) {
      const url = requireUrl(context);
      await context.reply("⏳ Extracting TikTok audio...");
      const data = await tikwm(context, url);
      const music = tikwmMediaUrl(data.music || data.music_info?.play);
      if (!music) throw new Error("No sound found in that link.");
      await sendAudioFromUrl(context, music, data.music_info?.title || data.title || "tiktok-sound");
    },
  },
  {
    name: "twitter",
    aliases: ["xdl"],
    category: "download",
    description: "Download a Twitter/X video.",
    usage: "twitter <post link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/(twitter\.com|x\.com)\/\w+\/status\/\d+/i.test(url)) {
        throw new Error("Send a Twitter/X post link (twitter.com/user/status/...).");
      }
      await context.reply("⏳ Fetching the post...");
      const status = url.match(/(?:twitter\.com|x\.com)\/(?:i\/web\/)?(\w+)\/status\/(\d+)/i);
      if (!status) throw new Error("Could not read that post link.");
      const [, user, id] = status;
      let tweet = null;
      for (const host of ["api.vxtwitter.com", "api.fxtwitter.com"]) {
        try {
          const payload = await fetchJson(`https://${host}/${user}/status/${id}`, {
            allowedHosts: [host],
            maximumBytes: 1024 * 1024,
          });
          if (payload?.tweet) {
            tweet = payload.tweet;
            break;
          }
        } catch {
          // Try the next mirror.
        }
      }
      const video = tweet?.media?.videos?.[0]?.url || tweet?.media?.videos?.[0]?.variants?.[0]?.url;
      if (!video) throw new Error("That post has no downloadable video.");
      const { buffer } = await fetchBuffer(video, {
        allowedHosts: ["video.twimg.com", "twimg.com", "vxtwitter.com", "fxtwitter.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 60_000,
      });
      await context.send({
        video: buffer,
        mimetype: "video/mp4",
        caption: `🐦 *${tweet.user?.name || tweet.author?.name || "X post"}*\n${String(tweet.text || "").slice(0, 300)}`,
      });
    },
  },
  {
    name: "instagram",
    aliases: ["ig"],
    category: "download",
    description: "Download an Instagram reel or public post video.",
    usage: "instagram <Instagram link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/instagram\.com\/(p|reel|reels|tv)\//i.test(url)) {
        throw new Error("Send an Instagram post, reel or IGTV link.");
      }
      await context.reply("⏳ Fetching Instagram media...");
      // SnapSave is a free key-less resolver used as a best-effort backend.
      const { buffer, contentType } = await postForm("https://snapsave.vn/action/parse", {
        form: { url, action: "parse" },
        allowedHosts: ["snapsave.vn"],
        maximumBytes: 512 * 1024,
        timeout: 30_000,
        headers: { accept: "*/*", origin: "https://snapsave.vn", referer: "https://snapsave.vn/" },
      });
      const html = buffer.toString("utf8");
      if (!contentType.includes("text") || !html) throw new Error("Instagram link could not be parsed.");
      const links = [...html.matchAll(/href="(https:[^"]+\.(?:mp4|jpg|jpeg|png)[^"]*)"/gi)]
        .map((match) => match[1].replaceAll("&amp;", "&"));
      if (!links.length) throw new Error("No downloadable media found. Is the post public?");
      const media = links.find((link) => link.includes(".mp4")) || links[0];
      const { buffer: file } = await fetchBuffer(media, {
        allowedHosts: ["snapsave.app", "snapsave.vn", "cdninstagram.com", "fbcdn.net", "instagram.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 60_000,
      });
      if (media.includes(".mp4")) {
        await context.send({ video: file, mimetype: "video/mp4", caption: "📸 Instagram • VENOM MD" });
      } else {
        await context.send({ image: file, caption: "📸 Instagram • VENOM MD" });
      }
    },
  },
  {
    name: "facebook",
    aliases: ["fb"],
    category: "download",
    description: "Download a Facebook video (public posts).",
    usage: "facebook <Facebook video link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/facebook\.com|fb\.watch/i.test(url)) throw new Error("Send a Facebook video link.");
      await context.reply("⏳ Fetching Facebook video...");
      const { buffer, contentType } = await postForm("https://snapsave.vn/action/parse", {
        form: { url, action: "parse" },
        allowedHosts: ["snapsave.vn"],
        maximumBytes: 512 * 1024,
        timeout: 30_000,
        headers: { accept: "*/*", origin: "https://snapsave.vn", referer: "https://snapsave.vn/" },
      });
      const html = buffer.toString("utf8");
      const links = [...html.matchAll(/href="(https:[^"]+\.mp4[^"]*)"/gi)]
        .map((match) => match[1].replaceAll("&amp;", "&"));
      const hd = links.find((link) => /hd|720|1080/i.test(link)) || links[0];
      if (!hd) throw new Error("No downloadable video found. Is the video public?");
      const { buffer: file } = await fetchBuffer(hd, {
        allowedHosts: ["snapsave.app", "snapsave.vn", "fbcdn.net", "facebook.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 60_000,
      });
      await context.send({ video: file, mimetype: "video/mp4", caption: "📼 Facebook video • VENOM MD" });
    },
  },
  {
    name: "mediafire",
    category: "download",
    description: "Download a file from a MediaFire share page.",
    usage: "mediafire <MediaFire link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/mediafire\.com\//i.test(url)) throw new Error("Send a MediaFire file link.");
      await context.reply("⏳ Resolving MediaFire file...");
      const { buffer, contentType } = await fetchBuffer(url, {
        allowedHosts: ["mediafire.com", "download.mediafire.com"],
        maximumBytes: 2 * 1024 * 1024,
        timeout: 30_000,
      });
      if (!contentType.includes("text/html")) throw new Error("That is not a MediaFire share page.");
      const direct = buffer.toString("utf8").match(/href="(https:\/\/download[^"']+)"/i)?.[1];
      if (!direct) throw new Error("Could not find the direct download. Is the link public?");
      const { buffer: file } = await fetchBuffer(direct, {
        allowedHosts: ["mediafire.com", "download.mediafire.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 120_000,
      });
      const detected = await fileTypeFromBuffer(file).catch(() => null);
      const name = decodeURIComponent(new URL(direct).pathname.split("/").pop() || "mediafire-file");
      await context.send({
        document: file,
        mimetype: detected?.mime || "application/octet-stream",
        fileName: name.slice(0, 120),
      });
    },
  },
  {
    name: "pint",
    aliases: ["pinterest"],
    category: "download",
    description: "Download a Pinterest pin image or video.",
    usage: "pint <Pinterest link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/pinterest\.[a-z.]+|pin\.it/i.test(url)) throw new Error("Send a Pinterest pin link.");
      await context.reply("⏳ Fetching the pin...");
      const { buffer, contentType } = await fetchBuffer(url, {
        allowedHosts: ["pinterest.com", "pin.it", "pinterest.co.uk", "pinterest.ca", "pinterest.ng"],
        maximumBytes: 1024 * 1024,
        timeout: 30_000,
      });
      const html = buffer.toString("utf8");
      const video = html.match(/property="og:video" content="([^"]+)"/i)?.[1];
      const image = html.match(/property="og:image" content="([^"]+)"/i)?.[1]
        || html.match(/"orig":\{"url":"([^"]+)"/i)?.[1]?.replaceAll("\\u002F", "/");
      const target = video || image;
      if (!target) throw new Error("Could not read that pin. Is it public?");
      const host = new URL(target).hostname;
      const { buffer: file } = await fetchBuffer(target, {
        allowedHosts: [host, "pinimg.com", "i.pinimg.com", "v.pinimg.com"],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 60_000,
      });
      if (video) {
        await context.send({ video: file, mimetype: "video/mp4", caption: "📌 Pinterest • VENOM MD" });
      } else {
        await context.send({ image: file, caption: "📌 Pinterest • VENOM MD" });
      }
    },
  },
  {
    name: "movie",
    category: "download",
    description: "Look up a movie with IMDb data and poster.",
    usage: "movie Inception",
    async execute(context) {
      if (!context.query) throw new Error("Enter a movie title.");
      const query = context.query.slice(0, 80);
      const seed = encodeURIComponent(query.toLowerCase().replace(/[^a-z0-9]/g, "") || "x");
      const payload = await fetchJson(
        `https://v3.sg.media-imdb.com/suggestion/${seed.slice(0, 1)}/${seed}.json`,
        { allowedHosts: ["sg.media-imdb.com", "media-imdb.com"], maximumBytes: 512 * 1024 },
      );
      const hit = (payload.d || []).find((item) => item.qid === "movie") || payload.d?.[0];
      if (!hit) throw new Error("Movie not found.");
      const caption = [
        `🎬 *${hit.l}* (${hit.y || "—"})`,
        `Type: ${hit.q || "movie"}`,
        hit.s ? `Starring: ${hit.s}` : "",
        `IMDb: https://www.imdb.com/title/${hit.id}/`,
      ].filter(Boolean).join("\n");
      if (hit.i?.imageUrl) {
        try {
          const { buffer } = await fetchBuffer(hit.i.imageUrl, {
            allowedHosts: ["media-amazon.com", "m.media-amazon.com"],
            maximumBytes: context.config.maxMediaBytes,
          });
          await context.send({ image: buffer, caption });
          return;
        } catch {
          // Poster is optional.
        }
      }
      await context.reply(caption);
    },
  },
  {
    name: "music",
    category: "download",
    description: "Search and download music audio from YouTube.",
    usage: "music <song name or link>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a song name.");
      const results = await searchYouTube(context.query, 1);
      if (!results.length) throw new Error("No results found.");
      await context.reply(`🎧 Now preparing: *${results[0].title}*`);
      const result = await downloadYouTube(results[0].url, "audio", context.config.maxMediaBytes);
      await context.send({
        audio: result.buffer,
        mimetype: result.mimetype,
        fileName: `${safeName(result.title)}.m4a`,
      });
    },
  },
  {
    name: "spotify",
    category: "download",
    description: "Get a Spotify track as audio (matched on YouTube).",
    usage: "spotify <Spotify track link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/open\.spotify\.com\/track\//i.test(url)) throw new Error("Send a Spotify track link.");
      const meta = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
        allowedHosts: ["open.spotify.com"],
        maximumBytes: 256 * 1024,
      });
      const title = String(meta.title || "Spotify track");
      await context.reply(`🎧 *${title}*\n⏳ Matching audio...`);
      const result = await downloadYouTube(title, "audio", context.config.maxMediaBytes);
      await context.send({
        audio: result.buffer,
        mimetype: result.mimetype,
        fileName: `${safeName(title)}.m4a`,
      });
    },
  },
  {
    name: "sc",
    aliases: ["soundcloud"],
    category: "download",
    description: "Get a SoundCloud track as audio (matched on YouTube).",
    usage: "sc <SoundCloud link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/soundcloud\.com\//i.test(url)) throw new Error("Send a SoundCloud track link.");
      const meta = await fetchJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
        allowedHosts: ["soundcloud.com"],
        maximumBytes: 256 * 1024,
      });
      const title = String(meta.title || "SoundCloud track");
      await context.reply(`🎧 *${title}*\n⏳ Matching audio...`);
      const result = await downloadYouTube(title, "audio", context.config.maxMediaBytes);
      await context.send({
        audio: result.buffer,
        mimetype: result.mimetype,
        fileName: `${safeName(title)}.m4a`,
      });
    },
  },
  {
    name: "audiomack",
    category: "download",
    description: "Get an Audiomack song as audio (matched on YouTube).",
    usage: "audiomack <Audiomack link>",
    async execute(context) {
      const url = requireUrl(context);
      if (!/audiomack\.com\//i.test(url)) throw new Error("Send an Audiomack song link.");
      const { buffer } = await fetchBuffer(url, {
        allowedHosts: ["audiomack.com"],
        maximumBytes: 512 * 1024,
        timeout: 30_000,
      });
      const html = buffer.toString("utf8");
      const title = html.match(/property="og:title" content="([^"]+)"/i)?.[1]
        || html.match(/<title>([^<]+)<\/title>/i)?.[1]?.split("|")[0].trim();
      if (!title) throw new Error("Could not read that Audiomack page.");
      await context.reply(`🎧 *${title}*\n⏳ Matching audio...`);
      const result = await downloadYouTube(title, "audio", context.config.maxMediaBytes);
      await context.send({
        audio: result.buffer,
        mimetype: result.mimetype,
        fileName: `${safeName(title)}.m4a`,
      });
    },
  },
  {
    name: "apk",
    category: "download",
    description: "Find an Android app on APKPure with a direct page link.",
    usage: "apk <app name>",
    async execute(context) {
      if (!context.query) throw new Error("Enter an app name.");
      const { buffer, contentType } = await fetchBuffer(
        `https://apkpure.com/search?q=${encodeURIComponent(context.query.slice(0, 60))}`,
        { allowedHosts: ["apkpure.com"], maximumBytes: 2 * 1024 * 1024, timeout: 30_000 },
      );
      const html = buffer.toString("utf8");
      const apps = [...html.matchAll(/href="(https:\/\/apkpure\.com\/[a-z0-9-]+\/[a-z0-9.]+)"[^>]*title="([^"]+)"/gi)]
        .slice(0, 5)
        .map((match) => ({ url: match[1], title: match[2] }));
      if (!apps.length) throw new Error("No apps found (APKPure may be blocking bots).");
      await context.reply(
        [`🤖 *APKPure results*`, "", ...apps.map((app, index) => `${index + 1}. *${app.title}*\n${app.url}`)].join("\n"),
      );
    },
  },
  {
    name: "subtitle",
    category: "download",
    description: "Find subtitles for a movie on YIFY Subtitles.",
    usage: "subtitle <movie name>",
    async execute(context) {
      if (!context.query) throw new Error("Enter a movie name.");
      const { buffer, contentType } = await fetchBuffer(
        `https://yifysubtitles.ch/search?q=${encodeURIComponent(context.query.slice(0, 60))}`,
        { allowedHosts: ["yifysubtitles.ch"], maximumBytes: 2 * 1024 * 1024, timeout: 30_000 },
      );
      if (!contentType.includes("text/html")) throw new Error("Subtitle search is unavailable right now.");
      const html = buffer.toString("utf8");
      const rows = [...html.matchAll(/<a href="(\/subtitles\/[^"]+)"[^>]*>([^<]+)<\/a>/g)]
        .slice(0, 8)
        .map((match) => ({ url: `https://yifysubtitles.ch${match[1]}`, title: match[2].trim() }));
      if (!rows.length) throw new Error("No subtitles found for that title.");
      await context.reply(
        [`💬 *Subtitle results*`, "", ...rows.map((row, index) => `${index + 1}. ${row.title}\n${row.url}`)].join("\n"),
      );
    },
  },
];

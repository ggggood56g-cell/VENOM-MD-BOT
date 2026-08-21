import { publicHttp } from "../src/lib/network.js";

const mergedCommands = ["tiktok", "ttdl", "tt"];
const API_RESPONSE_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const mediaLimitMb = Number.parseInt(process.env.MEDIA_MAX_MB || "64", 10);
const MEDIA_LIMIT =
  (Number.isFinite(mediaLimitMb) && mediaLimitMb > 0 ? mediaLimitMb : 64) *
  1024 *
  1024;

const TIKTOK_URL =
  /https:\/\/(?:vt|vm)\.tiktok\.com\/[^\s]+|https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/i;

export default {
  name: "tiktokDl",
  alias: [...mergedCommands],
  uniquecommands: ["tiktok", "ttdl", "tt"],
  description: "TikTok downloader and search",

  start: async (Venom, m, { text, prefix, doReact }) => {
    const input = String(text || m.quoted?.text || "").trim().slice(0, 500);
    if (!input) {
      return m.reply(`*TikTok Downloader*

Usage:
• ${prefix}tt <tiktok link>
• ${prefix}tt <search query>

Example:
• ${prefix}tt cosplay
• ${prefix}tt https://vt.tiktok.com/xxxxx`);
    }

    const apiKey = global.pickKey?.(global.tiktokAPIKeys);
    if (!apiKey) {
      return m.reply(
        "TikTok download is not configured. Set TIKTOK_API_KEY in the environment.",
      );
    }

    try {
      const detectedUrl = input.match(TIKTOK_URL)?.[0];
      await doReact("⏳");
      await m.reply("Processing... ⏳");

      if (detectedUrl) {
        const json = await requestApi("downloader/tiktok", {
          url: detectedUrl,
          apikey: apiKey,
        });
        if (!json?.data) throw new Error("The TikTok API returned no media.");
        await sendDownload(Venom, m, json.data);
      } else {
        const json = await requestApi("search/tiktok", {
          query: input.slice(0, 120),
          count: "1",
          apikey: apiKey,
        });
        const video = json?.data?.videos?.[0];
        if (!video) return m.reply(`No results found for "${input.slice(0, 80)}"`);
        await sendSearchResult(Venom, m, video);
      }

      await doReact("✅");
    } catch (error) {
      console.error(`[ VENOM ] TikTok request failed: ${error.message}`);
      await doReact("❌");
      await m.reply("Failed to fetch TikTok media. The provider may be unavailable.");
    }
  },
};

async function requestApi(endpoint, parameters) {
  const baseUrl = String(
    process.env.TIKTOK_API_BASE_URL || "https://kelvdraapi.domku.xyz/",
  ).trim();
  const url = new URL(endpoint.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl));
  if (url.protocol !== "https:") {
    throw new Error("TIKTOK_API_BASE_URL must use HTTPS.");
  }
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, String(value));
  }

  const response = await publicHttp.get(url.href, {
    headers: { accept: "application/json" },
    maxContentLength: API_RESPONSE_LIMIT,
    maxRedirects: 0,
    responseType: "json",
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (!response.data || typeof response.data !== "object") {
    throw new Error("TikTok API returned invalid JSON.");
  }
  return response.data;
}

async function sendDownload(Venom, m, data) {
  const caption = downloadCaption("TikTok Downloader", data);
  const images = Array.isArray(data.images) ? data.images.slice(0, 10) : [];

  if (images.length > 0) {
    await Venom.sendMessage(m.from, { text: caption }, { quoted: m });
    for (const imageUrl of images) {
      const image = await downloadMedia(imageUrl, "image");
      await Venom.sendMessage(m.from, { image }, { quoted: m });
    }
  } else if (data.play) {
    const video = await downloadMedia(resolveTikwmUrl(data.play), "video");
    await Venom.sendMessage(m.from, { video, caption }, { quoted: m });
  } else {
    throw new Error("The TikTok API returned no downloadable media.");
  }

  if (data.music_info?.play) {
    try {
      const audio = await downloadMedia(data.music_info.play, "audio");
      await Venom.sendMessage(
        m.from,
        {
          audio,
          mimetype: "audio/mpeg",
          fileName: `${sanitizeFileName(data.title || "tiktok")}.mp3`,
        },
        { quoted: m },
      );
    } catch (error) {
      console.warn(`[ VENOM ] TikTok audio was skipped: ${error.message}`);
    }
  }
}

async function sendSearchResult(Venom, m, videoData) {
  if (!videoData.play) throw new Error("The search result has no downloadable video.");
  const video = await downloadMedia(resolveTikwmUrl(videoData.play), "video");
  await Venom.sendMessage(
    m.from,
    {
      video,
      caption: downloadCaption("TikTok Search Result", videoData),
    },
    { quoted: m },
  );
}

async function downloadMedia(input, expectedType) {
  const url = new URL(String(input));
  if (url.protocol !== "https:") throw new Error("Media URL must use HTTPS.");

  const response = await publicHttp.get(url.href, {
    headers: { accept: `${expectedType}/*,application/octet-stream;q=0.8` },
    maxContentLength: MEDIA_LIMIT,
    responseType: "arraybuffer",
    timeout: REQUEST_TIMEOUT_MS,
  });
  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (
    contentType &&
    !contentType.startsWith(`${expectedType}/`) &&
    !contentType.startsWith("application/octet-stream")
  ) {
    throw new Error(`Media server returned unexpected type ${contentType}.`);
  }
  return Buffer.from(response.data || []);
}

function downloadCaption(label, data) {
  return `*『 ${label} 』*

🎬 *Title:* ${safeText(data.title)}
🌍 *Region:* ${safeText(data.region)}
⏱ *Duration:* ${formatDuration(data.duration)}
👁 *Views:* ${formatNumber(data.play_count)}
💬 *Comments:* ${formatNumber(data.comment_count)}
🔁 *Shares:* ${formatNumber(data.share_count)}
👤 *Uploader:* ${safeText(data.author?.nickname || data.author?.unique_id)}`;
}

function resolveTikwmUrl(value) {
  const input = String(value || "").trim();
  return input.startsWith("https://")
    ? input
    : new URL(input, "https://www.tikwm.com/").href;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function safeText(value, fallback = "-") {
  const output = String(value || fallback).replace(/[\r\n\t]+/g, " ").trim();
  return output.slice(0, 160) || fallback;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en") : "0";
}

function formatDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function sanitizeFileName(value) {
  return (
    String(value).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "").trim().slice(0, 40) ||
    "tiktok"
  );
}

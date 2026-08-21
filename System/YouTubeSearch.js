import { publicHttp } from "../src/lib/network.js";

const SEARCH_ENDPOINT = "https://www.youtube.com/results";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_RESULTS = 20;

export default async function searchYouTube(query, { limit = 10 } = {}) {
  const normalizedQuery = String(query || "").trim().slice(0, 120);
  if (!normalizedQuery) throw new Error("A YouTube search query is required.");

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("search_query", normalizedQuery);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "US");

  const response = await publicHttp.get(url.href, {
    timeout: 20_000,
    maxRedirects: 0,
    maxContentLength: MAX_RESPONSE_BYTES,
    responseType: "text",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (compatible; VENOM-MD-BOT/4.1; +https://github.com/MykelGoal/VENOM-MD-BOT)",
    },
  });
  const html = String(response.data || "");
  const initialData = extractInitialData(html);
  const requestedLimit = Math.max(1, Math.min(MAX_RESULTS, Number(limit) || 10));
  return collectVideos(initialData, requestedLimit);
}

async function readBoundedText(response, maximumBytes) {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error("YouTube response exceeded the allowed size.");
  }

  const decoder = new TextDecoder();
  let output = "";
  let total = 0;
  for await (const chunk of response.body || []) {
    total += chunk.byteLength;
    if (total > maximumBytes) {
      throw new Error("YouTube response exceeded the allowed size.");
    }
    output += decoder.decode(chunk, { stream: true });
  }
  output += decoder.decode();
  return output;
}

function extractInitialData(html) {
  const markers = ["ytInitialData =", "ytInitialData=", '"ytInitialData":'];
  let objectStart = -1;
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex >= 0) {
      objectStart = html.indexOf("{", markerIndex + marker.length);
      if (objectStart >= 0) break;
    }
  }
  if (objectStart < 0) throw new Error("YouTube search data was not found.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      return JSON.parse(html.slice(objectStart, index + 1));
    }
  }
  throw new Error("YouTube search data was incomplete.");
}

function collectVideos(initialData, limit) {
  const videos = [];
  const seenIds = new Set();
  const pending = [initialData];
  let visited = 0;

  while (pending.length && videos.length < limit && visited < 100_000) {
    const value = pending.pop();
    visited += 1;
    if (!value || typeof value !== "object") continue;

    const renderer = value.videoRenderer || value.compactVideoRenderer;
    if (renderer) {
      const video = normalizeVideo(renderer);
      if (video && !seenIds.has(video.videoId)) {
        seenIds.add(video.videoId);
        videos.push(video);
      }
    }

    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push(value[index]);
      }
    } else {
      const entries = Object.values(value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        pending.push(entries[index]);
      }
    }
  }
  return { videos, all: videos };
}

function normalizeVideo(renderer) {
  const videoId = String(renderer.videoId || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const title = textFrom(renderer.title).trim();
  if (!title) return null;

  const thumbnails = renderer.thumbnail?.thumbnails;
  const thumbnail = Array.isArray(thumbnails)
    ? thumbnails.at(-1)?.url
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return {
    type: "video",
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    timestamp: textFrom(renderer.lengthText) || "LIVE",
    thumbnail: normalizeThumbnail(thumbnail, videoId),
  };
}

function textFrom(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => String(run?.text || "")).join("");
  }
  return "";
}

function normalizeThumbnail(value, videoId) {
  const fallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (typeof value !== "string") return fallback;
  if (value.startsWith("//")) return `https:${value}`;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

export const __testables = { extractInitialData, collectVideos };

import ytdl from "@distube/ytdl-core";

// Avoid an unrelated update-check request on every first download. Dependency
// updates are handled through package-lock.json and npm audit instead.
process.env.YTDL_NO_UPDATE ||= "1";

const YOUTUBE_SEARCH = "https://www.youtube.com/results?search_query=";
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function networkCode(error) {
  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (RETRYABLE_NETWORK_CODES.has(current.code)) return current.code;
    current = current.cause;
  }
  return "";
}

async function retryNetwork(operation, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!networkCode(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

export function friendlyYouTubeError(error) {
  const code = networkCode(error);
  if (!code) return error;
  return new Error(
    `YouTube is unreachable from this deployment host (${code}). Try again shortly or check outbound HTTPS access.`,
    { cause: error },
  );
}

async function responseText(response, maximumBytes = 4 * 1024 * 1024) {
  if (!response.ok) throw new Error(`YouTube search failed (${response.status}).`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximumBytes) throw new Error("YouTube returned an oversized response.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("YouTube returned an oversized response.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function extractJsonObject(source, start) {
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(open, index + 1);
  }
  return null;
}

function textValue(value) {
  return String(
    value?.simpleText || value?.runs?.map((run) => run.text || "").join("") || "",
  ).trim();
}

export function parseYouTubeResults(html, limit = 5) {
  const marker = '"videoRenderer":';
  const results = [];
  const seen = new Set();
  let offset = 0;
  while (results.length < limit) {
    const markerIndex = html.indexOf(marker, offset);
    if (markerIndex < 0) break;
    offset = markerIndex + marker.length;
    const raw = extractJsonObject(html, offset);
    if (!raw) continue;
    try {
      const video = JSON.parse(raw);
      if (!/^[A-Za-z0-9_-]{11}$/.test(video.videoId || "") || seen.has(video.videoId)) {
        continue;
      }
      const title = textValue(video.title);
      if (!title) continue;
      seen.add(video.videoId);
      results.push({
        title,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        duration: textValue(video.lengthText) || "live/unknown",
        views: Number.parseInt(String(textValue(video.viewCountText)).replace(/\D/g, ""), 10) || 0,
        author: textValue(video.ownerText) || "Unknown",
      });
    } catch {
      // Ignore an individual malformed renderer and continue searching.
    }
  }
  return results;
}

async function streamToBuffer(stream, maximumBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maximumBytes) {
      stream.destroy();
      throw new Error(`Download is larger than ${Math.floor(maximumBytes / 1024 / 1024)} MB.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

export async function searchYouTube(query, limit = 5) {
  const search = String(query || "").trim().slice(0, 200);
  if (!search) return [];
  try {
    const response = await retryNetwork(() =>
      fetch(`${YOUTUBE_SEARCH}${encodeURIComponent(search)}`, {
        headers: {
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0 (compatible; VENOM-MD-BOT/2.0)",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      }),
    );
    return parseYouTubeResults(await responseText(response), limit);
  } catch (error) {
    throw friendlyYouTubeError(error);
  }
}

async function resolveUrl(input) {
  if (ytdl.validateURL(input)) return input;
  const [first] = await searchYouTube(input, 1);
  if (!first) throw new Error("No YouTube result was found.");
  return first.url;
}

export async function downloadYouTube(input, type, maximumBytes) {
  try {
    const url = await resolveUrl(String(input || "").trim());
    const info = await retryNetwork(() => ytdl.getInfo(url));
    const options =
      type === "audio"
        ? { filter: "audioonly", quality: "highestaudio" }
        : { filter: (format) => format.hasAudio && format.hasVideo, quality: "lowest" };
    const format = ytdl.chooseFormat(info.formats, options);
    if (!format?.url) throw new Error(`No compatible YouTube ${type} format was found.`);
    const buffer = await retryNetwork(
      () => streamToBuffer(ytdl.downloadFromInfo(info, { format }), maximumBytes),
    );
    return {
      buffer,
      title: String(info.videoDetails.title || "youtube").slice(0, 100),
      url,
      mimetype: String(format.mimeType || (type === "audio" ? "audio/mp4" : "video/mp4")).split(";")[0],
    };
  } catch (error) {
    throw friendlyYouTubeError(error);
  }
}

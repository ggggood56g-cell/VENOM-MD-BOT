import { fetchBuffer } from "./http.js";

// Google Translate exposes a key-less TTS endpoint, but it rejects plain
// server-side fetches (HTTP 403) unless the request looks like a browser
// visiting translate.google.com. Download the audio ourselves and send the
// buffer so WhatsApp never has to fetch the URL directly.
const GOOGLE_TTS = "https://translate.google.com/translate_tts";
const BROWSER_HEADERS = {
  accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.5",
  referer: "https://translate.google.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

export function normalizeLanguage(value) {
  const language = String(value || "").toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(language)) {
    throw new Error("Enter a valid language code, for example en, fr or pt.");
  }
  return language;
}

export async function synthesizeSpeech(text, language = "en") {
  const safeLanguage = normalizeLanguage(language);
  const url = `${GOOGLE_TTS}?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(safeLanguage)}&q=${encodeURIComponent(text)}`;
  try {
    const { buffer, contentType } = await fetchBuffer(url, {
      allowedHosts: ["translate.google.com"],
      maximumBytes: 1024 * 1024,
      timeout: 20_000,
      headers: BROWSER_HEADERS,
    });
    if (!buffer.length || !contentType.startsWith("audio")) {
      throw new Error("unexpected response");
    }
    return buffer;
  } catch (error) {
    throw new Error(
      "Text-to-speech is unavailable right now. Please try again in a moment.",
      { cause: error },
    );
  }
}

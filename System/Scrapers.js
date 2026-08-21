import { publicHttp as axios } from "../src/lib/network.js";
import { load as loadHtml } from "cheerio";

const requestOptions = {
  timeout: 20_000,
  maxContentLength: 3 * 1024 * 1024,
  maxBodyLength: 128 * 1024,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; VENOM-MD-BOT/4.1; +https://github.com/MykelGoal/VENOM-MD-BOT)",
  },
};

export async function wallpaper(query, page = 1) {
  const search = String(query || "").trim().slice(0, 120);
  if (!search) return [];
  const pageNumber = Math.max(1, Math.min(20, Number.parseInt(page, 10) || 1));
  const url = new URL("https://www.besthdwallpaper.com/search");
  url.searchParams.set("CurrentPage", String(pageNumber));
  url.searchParams.set("q", search);

  const { data } = await axios.get(url.href, requestOptions);
  const $ = loadHtml(String(data));
  const results = [];
  $("div.grid-item").each((_index, element) => {
    if (results.length >= 30) return false;
    const imageCandidates = [
      $(element).find("picture > img").attr("data-src"),
      $(element).find("picture > img").attr("src"),
      $(element).find("picture > source:nth-child(1)").attr("srcset"),
      $(element).find("picture > source:nth-child(2)").attr("srcset"),
    ]
      .map((value) => normalizeHttpsUrl(value, url))
      .filter(Boolean);
    if (!imageCandidates.length) return;
    results.push({
      title: $(element).find("div.info > a > h3").text().trim().slice(0, 200),
      type: $(element).find("div.info > a:nth-child(2)").text().trim().slice(0, 80),
      source: normalizeHttpsUrl(
        $(element).find("div > a:nth-child(3)").attr("href"),
        url,
      ),
      image: imageCandidates,
    });
  });
  return results;
}

export async function ringtone(query) {
  const search = String(query || "").trim().slice(0, 120);
  if (!search) return [];
  const url = new URL(
    `/en/search/${encodeURIComponent(search)}`,
    "https://meloboom.com",
  );
  const { data } = await axios.get(url.href, requestOptions);
  const $ = loadHtml(String(data));
  const results = [];
  $("#__next main section li").each((_index, element) => {
    if (results.length >= 30) return false;
    const audio = normalizeHttpsUrl($(element).find("audio").attr("src"), url);
    if (!audio) return;
    results.push({
      title: $(element).find("h4").text().trim().slice(0, 200),
      source: normalizeHttpsUrl($(element).find("a").attr("href"), url),
      audio,
    });
  });
  return results;
}

function normalizeHttpsUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  // srcset may include a density/width descriptor after the URL.
  const candidate = value.trim().split(/\s+/)[0];
  try {
    const url = new URL(candidate, base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export default { ringtone, wallpaper };

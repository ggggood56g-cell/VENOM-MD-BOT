import { fetchBuffer, fetchJson } from "../services/http.js";
import { addStickerMetadata, imageToSticker } from "../services/media.js";
import { randomItem } from "../utils.js";

const JIKAN = "https://api.jikan.moe/v4";
const ANIME_QUOTES = [
  ["People's lives don't end when they die. It ends when they lose faith.", "Itachi Uchiha"],
  ["A lesson without pain is meaningless.", "Edward Elric"],
  ["The world isn't perfect, but it's there for us trying the best it can.", "Roy Mustang"],
  ["If you don't take risks, you can't create a future.", "Monkey D. Luffy"],
  ["Hard work is worthless for those that don't believe in themselves.", "Naruto Uzumaki"],
];

async function jikan(path) {
  return fetchJson(`${JIKAN}${path}`, {
    allowedHosts: ["api.jikan.moe"],
    maximumBytes: 2 * 1024 * 1024,
  });
}

async function sendCard(context, imageUrl, caption) {
  if (imageUrl) {
    try {
      const { buffer } = await fetchBuffer(imageUrl, {
        allowedHosts: ["cdn.myanimelist.net", "images.weserv.nl"],
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ image: buffer, caption });
      return;
    } catch {
      // Text still provides the complete result if an image CDN is unavailable.
    }
  }
  await context.reply(caption);
}

async function search(context, type) {
  if (!context.query) throw new Error(`Enter a ${type} name.`);
  const payload = await jikan(`/${type}?q=${encodeURIComponent(context.query.slice(0, 100))}&limit=1&sfw=true`);
  const item = payload.data?.[0];
  if (!item) throw new Error(`No ${type} result was found.`);
  const title = item.title_english || item.title || item.name;
  const caption = [
    `🎌 *${title}*`,
    item.title_japanese ? `Japanese: ${item.title_japanese}` : "",
    item.type ? `Type: ${item.type}` : "",
    item.status ? `Status: ${item.status}` : "",
    item.episodes ? `Episodes: ${item.episodes}` : "",
    item.chapters ? `Chapters: ${item.chapters}` : "",
    item.score ? `Score: ${item.score}/10` : "",
    item.synopsis ? `\n${String(item.synopsis).slice(0, 900)}` : "",
    item.url || "",
  ].filter(Boolean).join("\n");
  await sendCard(context, item.images?.jpg?.large_image_url || item.images?.jpg?.image_url, caption);
  return item;
}

async function randomAnimeMedia(context, endpoint = "waifu") {
  const payload = await fetchJson(`https://nekos.best/api/v2/${endpoint}?amount=1`, {
    allowedHosts: ["nekos.best"],
    maximumBytes: 512 * 1024,
  });
  const result = payload.results?.[0];
  if (!result?.url) throw new Error("Anime media service returned no result.");
  const { buffer, contentType } = await fetchBuffer(result.url, {
    allowedHosts: ["nekos.best"],
    maximumBytes: context.config.maxMediaBytes,
  });
  const animated = contentType.includes("gif") || result.url.endsWith(".gif");
  if (animated) {
    const sticker = await addStickerMetadata(
      await imageToSticker(buffer),
      context.config.packname,
      context.config.author,
    );
    await context.send({ sticker });
  } else {
    await context.send({ image: buffer, caption: `🎌 ${endpoint}` });
  }
}

export default [
  {
    name: "anime",
    category: "anime",
    description: "Search for anime information.",
    usage: "anime <title>",
    execute: (context) => search(context, "anime"),
  },
  {
    name: "manga",
    category: "anime",
    description: "Search for manga information.",
    usage: "manga <title>",
    execute: (context) => search(context, "manga"),
  },
  {
    name: "character",
    category: "anime",
    description: "Search for an anime or manga character.",
    usage: "character <name>",
    execute: (context) => search(context, "characters"),
  },
  {
    name: "airing",
    category: "anime",
    description: "Show currently airing top anime.",
    async execute(context) {
      const payload = await jikan("/top/anime?filter=airing&limit=10&sfw=true");
      const rows = (payload.data || []).slice(0, 10).map(
        (item, index) => `${index + 1}. *${item.title_english || item.title}* — ${item.score || "?"}/10`,
      );
      await context.reply(`📺 *Currently airing*\n\n${rows.join("\n")}`);
    },
  },
  {
    name: "animenews",
    category: "anime",
    description: "Show recent news for an anime title.",
    usage: "animenews <title>",
    async execute(context) {
      if (!context.query) throw new Error("Enter an anime title.");
      const found = await jikan(`/anime?q=${encodeURIComponent(context.query.slice(0, 100))}&limit=1&sfw=true`);
      const anime = found.data?.[0];
      if (!anime) throw new Error("Anime not found.");
      const news = await jikan(`/anime/${anime.mal_id}/news`);
      const rows = (news.data || []).slice(0, 5).map(
        (item, index) => `${index + 1}. *${item.title}*\n${item.url}`,
      );
      await context.reply(`📰 *${anime.title} news*\n\n${rows.join("\n\n") || "No recent news."}`);
    },
  },
  {
    name: "animerec",
    category: "anime",
    description: "Show current anime recommendations.",
    async execute(context) {
      const payload = await jikan("/recommendations/anime");
      const titles = [];
      for (const recommendation of payload.data || []) {
        for (const entry of recommendation.entry || []) {
          if (!titles.includes(entry.title)) titles.push(entry.title);
          if (titles.length >= 10) break;
        }
        if (titles.length >= 10) break;
      }
      await context.reply(`✨ *Anime recommendations*\n\n${titles.map((name, index) => `${index + 1}. ${name}`).join("\n")}`);
    },
  },
  {
    name: "animequote",
    category: "anime",
    description: "Get a memorable anime quote.",
    async execute(context) {
      const [quote, character] = randomItem(ANIME_QUOTES);
      await context.reply(`💬 “${quote}”\n— *${character}*`);
    },
  },
  {
    name: "waifu",
    category: "anime",
    description: "Get a safe random anime image.",
    execute: (context) => randomAnimeMedia(context, "waifu"),
  },
  {
    name: "animegif",
    category: "anime",
    description: "Get a random anime reaction GIF.",
    execute: (context) => randomAnimeMedia(context, "happy"),
  },
  {
    name: "reactions",
    category: "anime",
    description: "Show available anime reaction commands.",
    async execute(context) {
      await context.reply("Use reaction commands such as hug, kiss, pat, slap, wave, wink, cry, dance, cuddle, poke, punch, tickle and smile.");
    },
  },
];

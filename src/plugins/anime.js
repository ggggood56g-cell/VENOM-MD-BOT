import { fetchBuffer, fetchJson } from "../services/http.js";
import { addStickerMetadata, imageToSticker } from "../services/media.js";
import { randomItem } from "../utils.js";

const JIKAN = "https://api.jikan.moe/v4";
const KITSU = "https://kitsu.io/api/edge";
const ANIME_QUOTES = [
  ["People's lives don't end when they die. It ends when they lose faith.", "Itachi Uchiha"],
  ["A lesson without pain is meaningless.", "Edward Elric"],
  ["The world isn't perfect, but it's there for us trying the best we can.", "Roy Mustang"],
  ["If you don't take risks, you can't create a future.", "Monkey D. Luffy"],
  ["Hard work is worthless for those that don't believe in themselves.", "Naruto Uzumaki"],
];

// Kitsu is the primary source because it is a dedicated free API. Jikan wraps
// MyAnimeList, which suffers frequent outages, so it stays as a fallback.
async function jikan(path) {
  return fetchJson(`${JIKAN}${path}`, {
    allowedHosts: ["api.jikan.moe"],
    maximumBytes: 2 * 1024 * 1024,
  });
}

async function kitsu(path) {
  return fetchJson(`${KITSU}${path}`, {
    allowedHosts: ["kitsu.io"],
    maximumBytes: 2 * 1024 * 1024,
  });
}

function kitsuAnimeEntry(item) {
  const attributes = item.attributes || {};
  return {
    title: attributes.titles?.en || attributes.canonicalTitle || "Unknown",
    japanese: attributes.titles?.ja_jp || "",
    type: String(attributes.subtype || "").toUpperCase(),
    status: attributes.status || "",
    episodes: attributes.episodeCount,
    chapters: 0,
    score: attributes.averageRating ? `${(Number(attributes.averageRating) / 10).toFixed(1)}/10` : "",
    synopsis: attributes.synopsis || "",
    imageUrl: attributes.posterImage?.large || attributes.posterImage?.original || "",
    url: attributes.slug ? `https://kitsu.io/anime/${attributes.slug}` : "",
  };
}

function kitsuMangaEntry(item) {
  const attributes = item.attributes || {};
  return {
    title: attributes.titles?.en || attributes.canonicalTitle || "Unknown",
    japanese: attributes.titles?.ja_jp || "",
    type: String(attributes.subtype || "").toUpperCase(),
    status: attributes.status || "",
    episodes: 0,
    chapters: attributes.chapterCount,
    score: attributes.averageRating ? `${(Number(attributes.averageRating) / 10).toFixed(1)}/10` : "",
    synopsis: attributes.synopsis || "",
    imageUrl: attributes.posterImage?.large || attributes.posterImage?.original || "",
    url: attributes.slug ? `https://kitsu.io/manga/${attributes.slug}` : "",
  };
}

function kitsuCharacterEntry(item) {
  const attributes = item.attributes || {};
  return {
    title: attributes.name || "Unknown",
    japanese: attributes.names?.ja_jp || "",
    type: "Character",
    status: "",
    episodes: 0,
    chapters: 0,
    score: "",
    synopsis: attributes.description || "",
    imageUrl: attributes.image?.original || "",
    url: item.id ? `https://kitsu.app/characters/${item.id}` : "",
  };
}

function jikanEntry(item) {
  return {
    title: item.title_english || item.title || item.name || "Unknown",
    japanese: item.title_japanese || item.name_kanji || "",
    type: item.type || "",
    status: item.status || "",
    episodes: item.episodes || 0,
    chapters: item.chapters || 0,
    score: item.score ? `${item.score}/10` : "",
    synopsis: item.synopsis || item.about || "",
    imageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || "",
    url: item.url || "",
  };
}

async function sendCard(context, imageUrl, caption) {
  if (imageUrl) {
    try {
      const { buffer } = await fetchBuffer(imageUrl, {
        allowedHosts: ["cdn.myanimelist.net", "media.kitsu.app", "images.weserv.nl"],
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

function entryCaption(entry) {
  return [
    `🎌 *${entry.title}*`,
    entry.japanese ? `Japanese: ${entry.japanese}` : "",
    entry.type ? `Type: ${entry.type}` : "",
    entry.status ? `Status: ${entry.status}` : "",
    entry.episodes ? `Episodes: ${entry.episodes}` : "",
    entry.chapters ? `Chapters: ${entry.chapters}` : "",
    entry.score ? `Score: ${entry.score}` : "",
    entry.synopsis ? `\n${String(entry.synopsis).replace(/<[^>]+>/g, "").slice(0, 900)}` : "",
    entry.url || "",
  ].filter(Boolean).join("\n");
}

async function search(context, kind) {
  if (!context.query) throw new Error(`Enter a ${kind === "characters" ? "character" : kind} name.`);
  const query = context.query.slice(0, 100);

  let entry = null;
  try {
    const path = kind === "characters"
      ? `/characters?filter[name]=${encodeURIComponent(query)}&page[limit]=1`
      : `/${kind}?filter[text]=${encodeURIComponent(query)}&page[limit]=1`;
    const payload = await kitsu(path);
    const item = payload.data?.[0];
    if (item) {
      entry = kind === "anime"
        ? kitsuAnimeEntry(item)
        : kind === "manga" ? kitsuMangaEntry(item) : kitsuCharacterEntry(item);
    }
  } catch {
    // Kitsu unreachable — try Jikan below.
  }

  if (!entry) {
    const payload = await jikan(`/${kind}?q=${encodeURIComponent(query)}&limit=1&sfw=true`);
    const item = payload.data?.[0];
    if (!item) throw new Error(`No ${kind === "characters" ? "character" : kind} result was found.`);
    entry = jikanEntry(item);
  }

  await sendCard(context, entry.imageUrl, entryCaption(entry));
  return entry;
}

async function airing(context) {
  try {
    const payload = await jikan("/top/anime?filter=airing&limit=10&sfw=true");
    const rows = (payload.data || []).slice(0, 10).map(
      (item, index) => `${index + 1}. *${item.title_english || item.title}* — ${item.score || "?"}/10`,
    );
    await context.reply(`📺 *Currently airing*\n\n${rows.join("\n")}`);
    return;
  } catch {
    // MyAnimeList unavailable — fall back to Kitsu trending anime.
  }
  const payload = await kitsu("/trending/anime?page[limit]=10");
  const rows = (payload.data || []).slice(0, 10).map((item, index) => {
    const attributes = item.attributes || {};
    const rating = attributes.averageRating ? ` — ${(Number(attributes.averageRating) / 10).toFixed(1)}/10` : "";
    return `${index + 1}. *${attributes.canonicalTitle || attributes.titles?.en || "Unknown"}*${rating}`;
  });
  await context.reply(`📺 *Trending anime now*\n\n${rows.join("\n")}`);
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
    execute: airing,
  },
  {
    name: "animenews",
    category: "anime",
    description: "Show recent news for an anime title.",
    usage: "animenews <title>",
    async execute(context) {
      if (!context.query) throw new Error("Enter an anime title.");
      try {
        const found = await jikan(`/anime?q=${encodeURIComponent(context.query.slice(0, 100))}&limit=1&sfw=true`);
        const anime = found.data?.[0];
        if (anime) {
          const news = await jikan(`/anime/${anime.mal_id}/news`);
          const rows = (news.data || []).slice(0, 5).map(
            (item, index) => `${index + 1}. *${item.title}*\n${item.url}`,
          );
          if (rows.length) {
            await context.reply(`📰 *${anime.title} news*\n\n${rows.join("\n\n")}`);
            return;
          }
        }
      } catch {
        // MyAnimeList unavailable — fall back to Google News RSS below.
      }
      // Key-less fallback when MyAnimeList is unreachable.
      const { buffer } = await fetchBuffer(
        `https://news.google.com/rss/search?q=${encodeURIComponent(`${context.query} anime`)}&hl=en-NG&gl=NG&ceid=NG:en`,
        { allowedHosts: ["news.google.com"], maximumBytes: 2 * 1024 * 1024 },
      );
      const xml = buffer.toString("utf8");
      const headlines = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)]
        .slice(1, 6)
        .map((match) => match[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/ - [^-]+$/, "").trim())
        .filter(Boolean);
      if (!headlines.length) throw new Error("No recent anime news was found.");
      await context.reply(`📰 *${context.query} news*\n\n${headlines.map((title, index) => `${index + 1}. ${title}`).join("\n")}`);
    },
  },
  {
    name: "animerec",
    category: "anime",
    description: "Show current anime recommendations.",
    async execute(context) {
      try {
        const payload = await jikan("/recommendations/anime");
        const titles = [];
        for (const recommendation of payload.data || []) {
          for (const entry of recommendation.entry || []) {
            if (!titles.includes(entry.title)) titles.push(entry.title);
            if (titles.length >= 10) break;
          }
          if (titles.length >= 10) break;
        }
        if (titles.length) {
          await context.reply(`✨ *Anime recommendations*\n\n${titles.map((name, index) => `${index + 1}. ${name}`).join("\n")}`);
          return;
        }
      } catch {
        // MyAnimeList unavailable — fall back to Kitsu most popular anime.
      }
      const payload = await kitsu("/anime?sort=-userCount&page[limit]=10");
      const titles = (payload.data || []).map(
        (item) => item.attributes?.titles?.en || item.attributes?.canonicalTitle || "Unknown",
      );
      await context.reply(`✨ *Popular anime right now*\n\n${titles.map((name, index) => `${index + 1}. ${name}`).join("\n")}`);
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

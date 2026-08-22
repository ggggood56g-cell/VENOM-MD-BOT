import { fetchBuffer, fetchJson } from "../services/http.js";

function requiredQuery(context, example) {
  if (!context.query) throw new Error(`Enter a search query. Example: ${context.prefix}${example}`);
  return context.query.slice(0, 180);
}

async function wikimediaImage(context, title) {
  const query = requiredQuery(context, `${title} Lagos skyline`);
  const payload = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|mime&format=json&origin=*`,
    { allowedHosts: ["commons.wikimedia.org"], maximumBytes: 2 * 1024 * 1024 },
  );
  const pages = Object.values(payload.query?.pages || {}).filter(
    (page) => page.imageinfo?.[0]?.url && String(page.imageinfo[0].mime).startsWith("image/"),
  );
  const selected = pages[0];
  if (!selected) throw new Error("No reusable image was found.");
  const url = selected.imageinfo[0].url;
  const { buffer } = await fetchBuffer(url, {
    allowedHosts: [new URL(url).hostname],
    maximumBytes: context.config.maxMediaBytes,
  });
  await context.send({ image: buffer, caption: `🖼️ ${selected.title.replace(/^File:/, "")}\nSource: Wikimedia Commons` });
}

function flagEmoji(iso2) {
  if (!/^[A-Za-z]{2}$/.test(iso2 || "")) return "🌍";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((character) => 127397 + character.charCodeAt(0)));
}

export default [
  {
    name: "country",
    category: "search",
    description: "Look up country facts.",
    usage: "country Nigeria",
    async execute(context) {
      const query = requiredQuery(context, "country Nigeria");
      const search = query.toLowerCase();
      // World Bank data is free and key-less (restcountries now requires an API key).
      const catalog = await fetchJson("https://api.worldbank.org/v2/country?format=json&per_page=320", {
        allowedHosts: ["api.worldbank.org"],
        maximumBytes: 512 * 1024,
      });
      const entries = Array.isArray(catalog?.[1]) ? catalog[1] : [];
      const country = entries.find((item) => item.name?.toLowerCase() === search)
        || entries.find((item) => item.id?.toLowerCase() === search || item.iso2Code?.toLowerCase() === search)
        || entries.find((item) => item.name?.toLowerCase().includes(search));
      if (!country) throw new Error("Country not found.");

      let population = "Population: N/A";
      try {
        const stats = await fetchJson(
          `https://api.worldbank.org/v2/country/${country.id}/indicator/SP.POP.TOTL?format=json&mrnev=1`,
          { allowedHosts: ["api.worldbank.org"], maximumBytes: 128 * 1024 },
        );
        const row = Array.isArray(stats?.[1]) ? stats[1][0] : null;
        if (row?.value != null) population = `Population: ~${Number(row.value).toLocaleString()} (${row.date})`;
      } catch {
        // Population is a bonus; the rest of the facts still work without it.
      }

      await context.reply([
        `${flagEmoji(country.iso2Code)} *${country.name}*`,
        `Capital: ${country.capitalCity || "N/A"}`,
        `Region: ${country.region?.value?.trim() || "N/A"}`,
        `Income level: ${country.incomeLevel?.value || "N/A"}`,
        population,
        `Code: ${country.id} / ${country.iso2Code || "N/A"}`,
      ].join("\n"));
    },
  },
  {
    name: "github",
    aliases: ["gh"],
    category: "search",
    description: "Look up a GitHub user or owner/repository.",
    usage: "github MykelGoal/VENOM-MD-BOT",
    async execute(context) {
      const query = requiredQuery(context, "github MykelGoal/VENOM-MD-BOT").replace(/^https?:\/\/github\.com\//i, "").replace(/^\/+|\/+$/g, "");
      if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(query)) throw new Error("Enter a valid GitHub user or owner/repository.");
      const isRepository = query.includes("/");
      const payload = await fetchJson(`https://api.github.com/${isRepository ? "repos" : "users"}/${query}`, {
        allowedHosts: ["api.github.com"],
        maximumBytes: 1024 * 1024,
        headers: { accept: "application/vnd.github+json" },
      });
      await context.reply(
        isRepository
          ? [`📦 *${payload.full_name}*`, payload.description || "No description", `Stars: ${payload.stargazers_count}`, `Forks: ${payload.forks_count}`, `Language: ${payload.language || "N/A"}`, payload.html_url].join("\n")
          : [`👤 *${payload.name || payload.login}*`, payload.bio || "No bio", `Repositories: ${payload.public_repos}`, `Followers: ${payload.followers}`, payload.html_url].join("\n"),
      );
    },
  },
  {
    name: "npm",
    category: "search",
    description: "Look up an npm package.",
    usage: "npm baileys",
    async execute(context) {
      const query = requiredQuery(context, "npm baileys");
      if (!/^@?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(query)) throw new Error("Enter a valid package name.");
      const payload = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(query).replace("%40", "@")}/latest`, {
        allowedHosts: ["registry.npmjs.org"],
        maximumBytes: 2 * 1024 * 1024,
      });
      await context.reply([`📦 *${payload.name}@${payload.version}*`, payload.description || "No description", `License: ${payload.license || "N/A"}`, `https://www.npmjs.com/package/${payload.name}`].join("\n"));
    },
  },
  {
    name: "book",
    category: "search",
    description: "Search for books.",
    usage: "book Things Fall Apart",
    async execute(context) {
      const query = requiredQuery(context, "book Things Fall Apart");
      // Open Library is free and key-less (Google Books anonymous quota is exhausted).
      const payload = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`, {
        allowedHosts: ["openlibrary.org"],
        maximumBytes: 512 * 1024,
      });
      const rows = (payload.docs || []).map((item, index) => {
        const author = (item.author_name || ["Unknown author"])[0];
        const published = item.first_publish_year ? `First published ${item.first_publish_year}` : "Unknown year";
        const editions = item.edition_count ? ` • ${item.edition_count} editions` : "";
        return `${index + 1}. *${item.title || "Untitled"}*\n${author} • ${published}${editions}\nhttps://openlibrary.org${item.key}`;
      });
      await context.reply(`📚 *Book results* (${payload.numFound ?? rows.length} found)\n\n${rows.join("\n\n") || "No books found."}`);
    },
  },
  {
    name: "lyrics",
    category: "search",
    description: "Find lyrics using artist and song title.",
    usage: "lyrics Wizkid | Essence",
    async execute(context) {
      if (!context.query) throw new Error(`Use: ${context.prefix}lyrics artist | song title`);
      const [artist, title] = context.query.split("|").map((value) => value.trim());
      const parameters = new URLSearchParams();
      if (artist && title) {
        parameters.set("artist_name", artist);
        parameters.set("track_name", title);
      } else if (!artist && !title) {
        parameters.set("q", context.query);
      } else {
        throw new Error(`Use: ${context.prefix}lyrics artist | song title`);
      }
      // LRCLIB is a free, key-less lyrics API (lyrics.ovh shut down in 2025).
      const results = await fetchJson(`https://lrclib.net/api/search?${parameters.toString()}`, {
        allowedHosts: ["lrclib.net"],
        maximumBytes: 512 * 1024,
      });
      if (!Array.isArray(results) || !results.length) throw new Error("Lyrics were not found.");
      const hit = results.find((item) => item.plainLyrics) || results[0];
      const lyrics = String(hit.plainLyrics || "")
        || String(hit.syncedLyrics || "").replace(/\[[^\]]*\]/g, "").trim();
      if (!lyrics.trim()) throw new Error("Lyrics were not found.");
      await context.reply(
        `🎵 *${hit.artistName || artist || "Unknown"} — ${hit.trackName || title || context.query}*\n\n${lyrics.slice(0, 5_500)}`,
      );
    },
  },
  {
    name: "urban",
    category: "search",
    description: "Look up a term on Urban Dictionary.",
    usage: "urban no wahala",
    async execute(context) {
      const query = requiredQuery(context, "urban no wahala");
      const payload = await fetchJson(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(query)}`, {
        allowedHosts: ["api.urbandictionary.com"],
        maximumBytes: 2 * 1024 * 1024,
      });
      const item = payload.list?.[0];
      if (!item) throw new Error("No definition found.");
      await context.reply(`📖 *${query}*\n\n${String(item.definition).replaceAll(/[\[\]]/g, "").slice(0, 3_500)}\n\nExample: ${String(item.example || "N/A").replaceAll(/[\[\]]/g, "").slice(0, 800)}`);
    },
  },
  {
    name: "wiki",
    category: "search",
    description: "Search Wikipedia summaries.",
    usage: "wiki Lagos",
    async execute(context) {
      const query = requiredQuery(context, "wiki Lagos");
      const search = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`, {
        allowedHosts: ["en.wikipedia.org"],
        maximumBytes: 1024 * 1024,
      });
      const title = search.query?.search?.[0]?.title;
      if (!title) throw new Error("Wikipedia result not found.");
      const summary = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
        allowedHosts: ["en.wikipedia.org"],
        maximumBytes: 1024 * 1024,
      });
      await context.reply(`📚 *${summary.title}*\n\n${String(summary.extract || "No summary.").slice(0, 4_500)}\n${summary.content_urls?.desktop?.page || ""}`);
    },
  },
  {
    name: "tvshow",
    category: "search",
    description: "Search television show information.",
    usage: "tvshow Supacell",
    async execute(context) {
      const query = requiredQuery(context, "tvshow Supacell");
      const payload = await fetchJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}`, {
        allowedHosts: ["api.tvmaze.com"],
        maximumBytes: 1024 * 1024,
      });
      const summary = String(payload.summary || "No summary").replace(/<[^>]+>/g, "");
      await context.reply([`📺 *${payload.name}*`, `Status: ${payload.status}`, `Language: ${payload.language}`, `Genres: ${(payload.genres || []).join(", ") || "N/A"}`, `Rating: ${payload.rating?.average || "N/A"}`, `\n${summary.slice(0, 2_500)}`, payload.officialSite || payload.url].join("\n"));
    },
  },
  {
    name: "websearch",
    aliases: ["web"],
    category: "search",
    description: "Get a quick web knowledge result.",
    usage: "websearch quantum computing",
    async execute(context) {
      const query = requiredQuery(context, "websearch quantum computing");
      const payload = await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
        allowedHosts: ["api.duckduckgo.com"],
        maximumBytes: 2 * 1024 * 1024,
      });
      const related = (payload.RelatedTopics || []).flatMap((item) => item.Topics || [item]).filter((item) => item.Text).slice(0, 5);
      await context.reply([`🔎 *${payload.Heading || query}*`, payload.AbstractText || "No instant summary available.", payload.AbstractURL || "", related.length ? "\nRelated:\n" + related.map((item) => `• ${item.Text}`).join("\n") : ""].filter(Boolean).join("\n"));
    },
  },
  {
    name: "img",
    aliases: ["image"],
    category: "search",
    description: "Find a reusable image from Wikimedia Commons.",
    usage: "img Lagos skyline",
    execute: (context) => wikimediaImage(context, "img"),
  },
  {
    name: "wallpaper",
    category: "search",
    description: "Find a reusable wallpaper image.",
    usage: "wallpaper African landscape",
    execute: (context) => wikimediaImage(context, "wallpaper"),
  },
];

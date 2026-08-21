import { publicHttp as axios } from "../src/lib/network.js";
import yts from "../System/YouTubeSearch.js";
import { searchit } from "@fantox01/search-it";
import { ringtone, wallpaper } from "../System/Scrapers.js";
import { Sticker, StickerTypes } from "../System/Sticker.js";
import getLyrics from "@fantox01/lyrics-scraper";
import BRAND from "../System/Branding.js";

let mergedCommands = [
  "google",
  "search",
  "lyrics",
  "yts",
  "youtubesearch",
  "ringtone",
  "stickersearch",
  "getsticker",
  "weather",
  "github",
  "gh",
  "wallpaper",
  "wall",
  "wikipedia",
  "wiki",
];

export default {
  name: "searches",
  alias: [...mergedCommands],
  uniquecommands: [
    "google",
    "lyrics",
    "yts",
    "ringtone",
    "stickersearch",
    "weather",
    "github",
    "wallpaper",
    "wikipedia",
  ],
  description: "All picture related commands",
  start: async (Venom, m, { inputCMD, text, doReact, prefix, pushName }) => {
    switch (inputCMD) {
      case "google":
      case "search":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide an image Search Term !\n\nExample: *${prefix}search Free Web development Course*`,
          );
        }
        await doReact("🔍");
        try {
          const googleSearch = await searchit(text, 10);
          if (!googleSearch || googleSearch.length === 0) {
            await doReact("❌");
            return m.reply(`No results found for: *${text}*`);
          }
          let resText = `  *『  ⚡️ Google Search Engine ⚡️  』*\n\n\n_🔍 Search Term:_ *${text}*\n\n\n`;
          for (const result of googleSearch) {
            resText += `_📍 Result:_ *${result.index + 1}*\n\n_🎀 Title:_ *${result.page}*\n\n_🔶 Description:_ *${result.desc}*\n\n_🔷 Link:_ *${result.url}*\n\n\n`;
          }
          await Venom.sendMessage(
            m.from,
            {
              video: {
                url: "https://media.tenor.com/3aaAzbTrTMwAAAPo/google-technology-company.mp4",
              },
              gifPlayback: true,
              caption: resText,
            },
            { quoted: m },
          );
        } catch (err) {
          console.error("Search error:", err);
          await doReact("❌");
          return m.reply(`An error occurred while searching for: *${text}*`);
        }
        break;

      case "lyrics":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide an lyrics Search Term !\n\nExample: *${prefix}lyrics Heat waves*`,
          );
        }
        await doReact("📃");
        await Venom.sendPresenceUpdate('composing', m.from);
        try {
          let result = await getLyrics(text);
          if (
            result &&
            result.status !== 500 &&
            result.lyrics &&
            result.thumbnail
          ) {
            let resText2 = `  *『  ⚡️ Lyrics Search Engine ⚡️  』*\n\n\n_Search Term:_ *${text}*\n\n\n*📍 Lyrics:* \n\n${result.lyrics}\n\n\n_*Powered by:*_ *Lyrics Scraper - by FantoX*\n\n_*Url:*_ https://github.com/FantoX/lyrics-scraper \n`;
            await Venom.sendMessage(
              m.from,
              {
                image: {
                  url: result.thumbnail,
                },
                caption: resText2,
              },
              { quoted: m },
            );
          } else {
            await doReact("❌");
            return m.reply(
              result?.message ||
                `Unable to find lyrics for the song: *${text}*`,
            );
          }
        } catch (err) {
          console.error("Lyrics Error:", err);
          await doReact("❌");
          return m.reply(
            `An error occurred while fetching lyrics for: *${text}*`,
          );
        }

        break;

      case "yts":
      case "youtubesearch":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide an Youtube Search Term !\n\nExample: *${prefix}yts Despacito*`,
          );
        }
        await doReact("📜");
        try {
          const query = String(text).trim().slice(0, 120);
          const search = await yts(query);
          const results = (search?.videos || search?.all || []).slice(0, 10);
          if (!results.length) return m.reply(`No videos found for: *${query}*`);

          let resultNumber = 1;
          let caption = `*🏮 YouTube Search Engine 🏮*\n\n_🧩 Search Term:_ *${query}*\n\n*📌 Results:* *${results.length}*\n`;
          for (const result of results) {
            caption += `\n_Result:_ *${resultNumber++}*\n_🎀 Title:_ *${String(result.title || "Untitled").slice(0, 160)}*\n_🔶 Duration:_ *${result.timestamp || "-"}*\n_🔷 Link:_ ${result.url}\n\n`;
          }

          await Venom.sendMessage(
            m.from,
            {
              image: { url: results[0].thumbnail },
              caption,
            },
            { quoted: m },
          );
        } catch (error) {
          console.error(`[ VENOM ] YouTube search failed: ${error.message}`);
          await doReact("❌");
          await m.reply("YouTube search is unavailable right now.");
        }
        break;

      case "ringtone":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide an ringtone Search Term !\n\nExample: *${prefix}ringtone iphone*`,
          );
        }
        await doReact("🎶");
        try {
          const results = await ringtone(text);
          if (!results.length) return m.reply(`No ringtone found for: *${text}*`);
          const result = results[Math.floor(Math.random() * results.length)];
          await Venom.sendMessage(
            m.from,
            {
              audio: { url: result.audio },
              fileName: `${String(result.title || text).replace(/[^a-z0-9 _-]/gi, "").slice(0, 80) || "ringtone"}.mp3`,
              mimetype: "audio/mpeg",
            },
            { quoted: m },
          );
        } catch (error) {
          console.error(`[ VENOM ] Ringtone search failed: ${error.message}`);
          await doReact("❌");
          await m.reply("Ringtone search is unavailable right now.");
        }
        break;

      case "weather":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide an ringtone Search Term !\n\n*${prefix}weather Kolkata*`,
          );
        }
        await doReact("🌤");
        const weatherApiKey = String(process.env.OPENWEATHER_API_KEY || "").trim();
        if (!weatherApiKey) {
          await doReact("❌");
          return m.reply("Weather is not configured. Set OPENWEATHER_API_KEY in the environment.");
        }
        const myweather = await axios.get(
          "https://api.openweathermap.org/data/2.5/weather",
          {
            params: {
              q: text.slice(0, 100),
              units: "metric",
              appid: weatherApiKey,
              lang: "en",
            },
            timeout: 10_000,
          },
        );

        let weathertext = `           🌤 *Weather Report* 🌤  \n\n🔎 *Search Location:* ${myweather.data.name}\n*💮 Country:* ${myweather.data.sys.country}\n🌈 *Weather:* ${myweather.data.weather[0].description}\n🌡️ *Temperature:* ${myweather.data.main.temp}°C\n❄️ *Minimum Temperature:* ${myweather.data.main.temp_min}°C\n📛 *Maximum Temperature:* ${myweather.data.main.temp_max}°C\n💦 *Humidity:* ${myweather.data.main.humidity}%\n🎐 *Wind:* ${myweather.data.wind.speed} km/h\n`;

        await Venom.sendMessage(
          m.from,
          {
            video: {
              url: "https://media.tenor.com/bC57J4v11UcAAAPo/weather-sunny.mp4",
            },
            gifPlayback: true,
            caption: weathertext,
          },
          { quoted: m },
        );
        break;

      case "stickersearch":
      case "getsticker":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide a sticker Search Term !\n\n*${prefix}stickersearch Cheems bonk*`,
          );
        }
        const tenorKey = global.tenorApiKey;
        if (!tenorKey) {
          await doReact("❌");
          return m.reply("Sticker search is not configured. Set TENOR_API_KEY.");
        }
        await doReact("🧧");
        const gif = await axios.get("https://tenor.googleapis.com/v2/search", {
          params: {
            q: text.slice(0, 100),
            key: tenorKey,
            client_key: "venom_md_bot",
            limit: 8,
            media_filter: "gif",
          },
          timeout: 10_000,
        });
        const results = Array.isArray(gif.data?.results) ? gif.data.results : [];
        if (!results.length) return m.reply("No matching stickers were found.");
        const selected = results[Math.floor(Math.random() * results.length)];
        const gifUrl = selected?.media_formats?.gif?.url;
        if (!gifUrl) return m.reply("The selected sticker is unavailable.");

        const stickerMess = new Sticker(gifUrl, {
          pack: global.packname,
          author: pushName,
          type: StickerTypes.FULL,
          categories: ["🤩", "🎉"],
          id: "12345",
          quality: 60,
          background: "transparent",
        });
        const stickerBuffer = await stickerMess.toBuffer();
        await Venom.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
        break;

      case "gh":
      case "github":
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide a valid *Github* username!\n\nExample: *${prefix}gh MykelGoal*`,
          );
        }
        await doReact("📊");
        let GHuserInfo;
        try {
          const ghRes = await axios.get(`https://api.github.com/users/${text}`);
          GHuserInfo = ghRes.data;
        } catch (error) {
          await doReact("❌");
          return m.reply(
            `GitHub user not found or API error: ${error.message}`,
          );
        }
        const GhUserPP = GHuserInfo.avatar_url;
        let resText4 = `        *🏮 GitHub User Info 🏮*\n\n_🎀 Username:_ *${GHuserInfo.login}*\n_🧩 Name:_ *${GHuserInfo.name}*\n\n_🧣 Bio:_ *${GHuserInfo.bio}*\n\n_🍁 Total Followers:_ *${GHuserInfo.followers}*\n_🔖 Total Public Repos:_ *${GHuserInfo.public_repos}*\n_📌 Website:_ ${GHuserInfo.blog}\n`;

        Venom.sendMessage(
          m.from,
          {
            image: { url: GhUserPP, mimetype: "image/jpeg" },
            caption: resText4,
          },
          { quoted: m },
        );
        break;

      case "wallpaper":
      case "wall":
        if (!text) {
          await doReact("❔");
          return m.reply(`Please provide a wallpaper search term!\n\nExample: *${prefix}wallpaper nature*`);
        }
        await doReact("🖼️");
        try {
          const results = await wallpaper(text);
          if (!results || !results.length) {
            await doReact("❌");
            return m.reply(`No wallpapers found for: *${text}*`);
          }
          const picked = results[Math.floor(Math.random() * Math.min(results.length, 10))];
          const imgUrl = picked.image[0] || picked.image[1] || picked.image[2];
          if (!imgUrl) {
            await doReact("❌");
            return m.reply(`No wallpapers found for: *${text}*`);
          }
          const caption = `🖼️ *${picked.title || text}*\n_Type:_ ${picked.type || "Wallpaper"}\n\n_🧩 Powered by_ *${BRAND.botName}*`;
          await Venom.sendMessage(m.from, { image: { url: imgUrl }, caption }, { quoted: m });
        } catch (err) {
          console.error("[ WALLPAPER ] Error:", err.message);
          await doReact("❌");
          m.reply(`Wallpaper search failed: ${err.message}`);
        }
        break;

      case "wikipedia":
      case "wiki":
        if (!text) {
          await doReact("❔");
          return m.reply(`Please provide a search term!\n\nExample: *${prefix}wiki Elon Musk*`);
        }
        await doReact("📖");
        try {
          // Search for the best matching article
          const searchRes = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`,
            {
              timeout: 10000,
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
            }
          );
          const { title, extract, thumbnail, content_urls } = searchRes.data;
          if (!extract) {
            await doReact("❌");
            return m.reply(`No Wikipedia article found for: *${text}*`);
          }
          // Trim extract to 800 chars
          const summary = extract.length > 800 ? extract.slice(0, 800) + "..." : extract;
          const caption = `📖 *${title}*\n\n${summary}\n\n🔗 ${content_urls?.desktop?.page || ""}`;
          if (thumbnail?.source) {
            await Venom.sendMessage(m.from, { image: { url: thumbnail.source }, caption }, { quoted: m });
          } else {
            await Venom.sendMessage(m.from, { text: caption }, { quoted: m });
          }
        } catch (err) {
          if (err.response?.status === 404) {
            await doReact("❌");
            return m.reply(`No Wikipedia article found for: *${text}*`);
          }
          console.error("[ WIKI ] Error:", err.message);
          await doReact("❌");
          m.reply(`Wikipedia search failed: ${err.message}`);
        }
        break;

      default:
        break;
    }
  },
};

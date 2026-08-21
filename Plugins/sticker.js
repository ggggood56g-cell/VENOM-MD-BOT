import fs from "fs";
import { publicHttp as axios } from "../src/lib/network.js";
import { Sticker, StickerTypes } from "../System/Sticker.js";
import { GraphOrg as TelegraPh } from "../System/Uploader.js";
let mergedCommands = [
  "sticker",
  "s",
  "steal",
  "take",
  "stickercrop",
  "scrop",
  "smeme",
  "stickermeme",
  "quote",
  "q",
  "emojimix",
];

export default {
  name: "stickerformat",
  alias: [...mergedCommands],
  uniquecommands: [
    "sticker",
    "steal",
    "scrop",
    "smeme",
    "stickermeme",
    "q",
    "emojimix",
  ],
  description: "All Sticker formatting Commands",
  start: async (
    Venom,
    m,
    {
      inputCMD,
      text,
      pushName,
      prefix,
      doReact,
      args,
      itsMe,
      participants,
      metadata,
      mentionByTag,
      mime,
      isMedia,
      quoted,
      botNumber,
      isBotAdmin,
      groupAdmin,
      isAdmin,
    }
  ) => {
    switch (inputCMD) {
      case "s":
      case "sticker":
        if (/image/.test(mime)) {
          await doReact("🔖");
          let mediaMess = await quoted.download();
          let stickerMess = new Sticker(mediaMess, {
            pack: packname,
            author: pushName,
            type: StickerTypes.FULL,
            categories: ["🤩", "🎉"],
            id: "12345",
            quality: 70,
            background: "transparent",
          });
          const stickerBuffer = await stickerMess.toBuffer();
          Venom.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
        } else if (/video/.test(mime)) {
          await doReact("🔖");
          let mediaMess = await quoted.download();
          if ((quoted.msg || quoted).seconds > 15) {
            await doReact("❌");
            return Venom.sendMessage(
              m.from,
              { text: "Please send video less than 15 seconds." },
              { quoted: m }
            );
          }
          let stickerMess = new Sticker(mediaMess, {
            pack: packname,
            author: pushName,
            type: StickerTypes.FULL,
            categories: ["🤩", "🎉"],
            id: "12345",
            quality: 70,
            background: "transparent",
          });
          const stickerBuffer2 = await stickerMess.toBuffer();
          Venom.sendMessage(m.from, { sticker: stickerBuffer2 }, { quoted: m });
        } else {
          await doReact("❌");
          m.reply(
            `Please mention an *image/video* and type *${prefix}s* to create sticker.`
          );
        }
        break;

      case "steal":
      case "take":
        if (!m.quoted) {
          await doReact("❔");
          return m.reply(`Please meantion a sticker to steal it.`);
        }
        await doReact("🀄️");
        let packName, authorName;
        if (!args.join(" ")) {
          packName = pushName;
          authorName = pushName;
        } else if (args.join(" ").includes(",")) {
          packName = args.join(" ").split(",")[0];
          authorName = args.join(" ").split(",")[1];
        } else {
          packName = args.join(" ");
          authorName = args.join(" ");
        }
        if (/webp/.test(mime)) {
          let mediaMess = await quoted.download();
          let stickerMess = new Sticker(mediaMess, {
            pack: packName,
            author: authorName,
            type: StickerTypes.FULL,
            categories: ["🤩", "🎉"],
            id: "12345",
            quality: 70,
            background: "transparent",
          });
          const stickerBuffer = await stickerMess.toBuffer();
          Venom.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
        } else {
          await doReact("❌");
          m.reply(
            `Please mention a *Sticker* and type *${prefix}steal <packname , authorname>* to create sticker with your name.`
          );
        }

        break;

      case "scrop":
      case "stickercrop":
        if (/image/.test(mime)) {
          await doReact("🃏");
          let mediaMess = await quoted.download();
          let stickerMess = new Sticker(mediaMess, {
            pack: packname,
            author: pushName,
            type: StickerTypes.CROPPED,
            categories: ["🤩", "🎉"],
            id: "12345",
            quality: 70,
            background: "transparent",
          });
          const stickerBuffer = await stickerMess.toBuffer();
          Venom.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
        } else if (/video/.test(mime)) {
          await doReact("🃏");
          let mediaMess = await quoted.download();
          if ((quoted.msg || quoted).seconds > 15) {
            await doReact("❌");
            return m.reply("Please send video less than 15 seconds.");
          }
          let stickerMess = new Sticker(mediaMess, {
            pack: packname,
            author: pushName,
            type: StickerTypes.CROPPED,
            categories: ["🤩", "🎉"],
            id: "12345",
            quality: 70,
            background: "transparent",
          });
          const stickerBuffer2 = await stickerMess.toBuffer();
          Venom.sendMessage(m.from, { sticker: stickerBuffer2 }, { quoted: m });
        } else {
          await doReact("❌");
          m.reply(
            `Please mention an *imade/video* and type *${prefix}s* to create cropped sticker.`
          );
        }
        break;

      case "smeme":
      case "stickermeme":
        if (/image/.test(mime)) {
          if (!text) {
            await doReact("❔");
            return m.reply(
              `Please type *${prefix}smeme <text>* to create sticker meme.`
            );
          }
          await doReact("📮");
          let media;
          try {
            media = await Venom.downloadAndSaveMediaMessage(quoted);
            const backgroundUrl = await TelegraPh(media);
            const memeUrl = new URL(
              `/images/custom/-/${encodeURIComponent(String(text).slice(0, 200))}.png`,
              "https://api.memegen.link",
            );
            memeUrl.searchParams.set("background", backgroundUrl);

            const stickerMess = new Sticker(memeUrl.href, {
              pack: packname,
              author: pushName,
              type: StickerTypes.FULL,
              categories: ["🤩", "🎉"],
              id: "12345",
              quality: 70,
              background: "transparent",
            });

            const stickerBuffer2 = await stickerMess.toBuffer();
            await Venom.sendMessage(
              m.from,
              { sticker: stickerBuffer2 },
              { quoted: m },
            );
          } finally {
            if (media) await fs.promises.unlink(media).catch(() => {});
          }
        } else {
          await doReact("❌");
          m.reply(
            `Please mention an *image* and type *${prefix}smeme* to create sticker meme.`
          );
        }
        break;

      case "q":
      case "quote":
        if (!text && !m.quoted) {
          await doReact("❔");
          return m.reply(
            `Please provide a text (Type or mention a message) !\n\nExample: ${prefix}q Venom MD is OP`
          );
        }

        let userPfp;
        if (m.quoted) {
          try {
            userPfp = await Venom.profilePictureUrl(m.quoted.sender, "image");
          } catch (e) {
            userPfp = botImage3;
          }
        } else {
          try {
            userPfp = await Venom.profilePictureUrl(m.sender, "image");
          } catch (e) {
            userPfp = botImage3;
          }
        }
        await doReact("📮");
        const waUserName = pushName;

        const quoteText = String(
          m.quoted?.text || (args ? args.join(" ") : ""),
        ).slice(0, 1000);

        const quoteJson = {
          type: "quote",
          format: "png",
          backgroundColor: "#FFFFFF",
          width: 700,
          height: 580,
          scale: 2,
          messages: [
            {
              entities: [],
              avatar: true,
              from: {
                id: 1,
                name: waUserName,
                photo: {
                  url: userPfp,
                },
              },
              text: quoteText,
              replyMessage: {},
            },
          ],
        };

        const quoteResponse = await axios.post(
          "https://bot.lyo.su/quote/generate",
          quoteJson,
          {
            headers: { "Content-Type": "application/json" },
            timeout: 20_000,
            maxBodyLength: 1024 * 1024,
            maxContentLength: 15 * 1024 * 1024,
          },
        );

        const quoteImage = Buffer.from(
          String(quoteResponse.data?.result?.image || ""),
          "base64",
        );
        if (!quoteImage.length || quoteImage.length > 10 * 1024 * 1024) {
          throw new Error("Quote service returned an invalid image.");
        }
        const stickerMess = new Sticker(quoteImage, {
          pack: packname,
          author: pushName,
          type: StickerTypes.FULL,
          categories: ["🤩", "🎉"],
          id: "12345",
          quality: 70,
          background: "transparent",
        });

        const stickerBuffer2 = await stickerMess.toBuffer();
        await Venom.sendMessage(
          m.from,
          { sticker: stickerBuffer2 },
          { quoted: m },
        );
        break;

      case "emojimix": {
        const tenorKey = global.tenorApiKey;
        if (!tenorKey) {
          return m.reply("Emoji Mix is not configured. Set TENOR_API_KEY.");
        }
        const emojiParts = String(args[0] || "").split("+");
        if (
          emojiParts.length !== 2 ||
          emojiParts.some((emoji) => !emoji || [...emoji].length > 8)
        ) {
          await doReact("❔");
          return m.reply(
            `Please provide two emojis to combine! *Example:* ${prefix}emojimix 🦉+🤣`,
          );
        }

        await doReact("🔖");
        try {
          const [emoji1, emoji2] = emojiParts;
          const { data } = await axios.get(
            "https://tenor.googleapis.com/v2/featured",
            {
              params: {
                key: tenorKey,
                contentfilter: "high",
                media_filter: "png_transparent",
                component: "proactive",
                collection: "emoji_kitchen_v5",
                q: `${emoji1}_${emoji2}`,
                limit: 1,
              },
              timeout: 15_000,
              maxContentLength: 1024 * 1024,
            },
          );
          const imageUrl = data?.results?.[0]?.url;
          if (!imageUrl) throw new Error("Tenor returned no matching emoji.");

          const imageResponse = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 20_000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
          });
          const sticker = new Sticker(Buffer.from(imageResponse.data), {
            pack: packname,
            author: pushName,
            type: StickerTypes.FULL,
            categories: ["🤩", "🎉"],
            id: "12345",
            quality: 70,
            background: "transparent",
          });
          const stickerBuffer = await sticker.toBuffer();
          await Venom.sendMessage(
            m.from,
            { sticker: stickerBuffer },
            { quoted: m },
          );
        } catch (error) {
          console.error(`[ VENOM ] Emoji Mix failed: ${error.message}`);
          await doReact("❌");
          await m.reply("Emoji Mix is unavailable right now. Try again later.");
        }
        break;
      }
      default:
        break;
    }
  },
};

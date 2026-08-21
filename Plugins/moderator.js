import fs from "fs";
import path from "path";
import BRAND from "../System/Branding.js";
import {
  banUser,
  checkBan,
  unbanUser,
  addMod,
  checkMod,
  delMod,
  setChar,
  getChar,
  activateChatBot,
  checkPmChatbot,
  deactivateChatBot,
  setBotMode,
  getBotMode,
  banGroup,
  checkBanGroup,
  unbanGroup,
} from "../System/MongoDB/MongoDb_Core.js";

import { userData, groupData } from "../System/MongoDB/MongoDB_Schema.js";

const mergedCommands = [
  "addmod",
  "setmod",
  "delmod",
  "removemod",
  "modlist",
  "mods",
  "owners",
  "owner",
  "ban",
  "banuser",
  "unban",
  "unbanuser",
  "banlist",
  "listbans",
  "setchar",
  "dmchatbot",
  "pmchatbot",
  "bangroup",
  "bangc",
  "unbangroup",
  "unbangc",
  "setbotmode",
  "mode",
  "getcmd",
  "getplugin",
  "cmdfile",
  "charlist",
  "characters",
];

export default {
  name: "moderators",
  alias: [...mergedCommands],
  uniquecommands: [
    "addmod",
    "delmod",
    "mods",
    "ban",
    "unban",
    "banlist",
    "setchar",
    "pmchatbot",
    "bangroup",
    "unbangroup",
    "mode",
    "getcmd",
    "charlist",
  ],
  description: "All Moderator/Owner Commands",
  start: async (
    Venom,
    m,
    {
      inputCMD,
      text,
      mods,
      isCreator,
      banData,
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
      pushName,
      groupName,
      modcheck,
    },
  ) => {
    const isUsermod = modcheck;
    if (
      !isCreator &&
      !isUsermod &&
      inputCMD !== "charlist" &&
      inputCMD !== "characters" &&
      inputCMD !== "mods" &&
      inputCMD !== "modlist" &&
      inputCMD !== "owners" &&
      inputCMD !== "owner"
    ) {
      await doReact("❌");
      return m.reply("Sorry, only my *Mods* can use this command !");
    }
    switch (inputCMD) {
      case "addmod":
      case "setmod": {
        if (!isCreator) {
          await doReact("❌");
          return m.reply("Only deployment owners can add moderators.");
        }
        if (!text && !m.quoted) {
          await doReact("❌");
          return m.reply(`Please tag a user to make *mod*!`);
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const userId = mentionedUser;
        if (!userId) return m.reply("Please mention a valid user to make a moderator.");
        const isTargetMod = await checkMod(userId);

        try {
          if (isTargetMod) {
            await doReact("✅");
            return Venom.sendMessage(
              m.from,
              {
                text: `@${userId.split("@")[0]} is already registered as a mod`,
                mentions: [userId],
              },
              { quoted: m },
            );
          }
          await doReact("✅");
          await addMod(userId);
          await Venom.sendMessage(
            m.from,
            {
              text: `@${userId.split("@")[0]} is successfully registered to mods`,
              mentions: [userId],
            },
            { quoted: m },
          );
        } catch (err) {
          console.error("[ EXCEPTION ] addmod error:", err.message);
          await doReact("❌");
          await m.reply(`An error occurred: ${err.message}`);
        }
        break;
      }

      case "delmod":
      case "removemod": {
        if (!isCreator) {
          await doReact("❌");
          return m.reply("Only deployment owners can remove moderators.");
        }
        if (!text && !m.quoted) {
          await doReact("❔");
          return m.reply(`Please tag a user to remove from *mod*!`);
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const userId = mentionedUser;
        if (!userId) return m.reply("Please mention a valid moderator to remove.");
        const isTargetMod = await checkMod(userId);

        try {
          if (!isTargetMod) {
            await doReact("✅");
            return Venom.sendMessage(
              m.from,
              {
                text: `@${userId.split("@")[0]} is not registered as a mod !`,
                mentions: [userId],
              },
              { quoted: m },
            );
          }
          await delMod(userId);
          await Venom.sendMessage(
            m.from,
            {
              text: `@${userId.split("@")[0]} is successfully removed from mods`,
              mentions: [userId],
            },
            { quoted: m },
          );
        } catch (err) {
          console.error("[ EXCEPTION ] delmod error:", err.message);
          await doReact("❌");
          await m.reply(`An error occurred: ${err.message}`);
        }
        break;
      }

      case "modlist":
      case "owners":
      case "owner":
      case "mods": {
        await doReact("✅");
        try {
          const modlist = await userData.find({ addedMods: true });
          const ownerList = global.owner;
          const ownerJids = ownerList.map((owner) => `${owner}@s.whatsapp.net`);
          const modJids = modlist.map((mod) => mod.id);
          const mentions = [...new Set([BRAND.creatorJid, ...ownerJids, ...modJids])];

          let textM = `🐍 *${BRAND.botName}*\n\n`;
          textM += `👑 *Original Creator*\n`;
          textM += `• ${BRAND.creator}\n`;
          textM += `• @${BRAND.creatorNumber}\n`;
          textM += `• ${BRAND.githubUrl}\n`;
          textM += `• ${BRAND.whatsappUrl}\n`;

          textM += `\n🛡️ *Deployment Owners*\n`;
          for (const owner of ownerList) textM += `• @${owner}\n`;

          if (modlist.length > 0) {
            textM += `\n🧩 *Added Mods*\n`;
            for (const mod of modlist) textM += `• @${mod.id.split("@")[0]}\n`;
          }

          textM += `\nFor group help, use *${prefix}support*. Please do not spam private contacts.`;

          await Venom.sendMessage(
            m.from,
            {
              image: { url: BRAND.logoPath },
              caption: textM,
              mentions,
            },
            { quoted: m },
          );
        } catch (err) {
          console.error("[ EXCEPTION ] modlist error:", err.message);
          await doReact("❌");
          return Venom.sendMessage(
            m.from,
            { text: `An internal error occurred while fetching the mod list.` },
            { quoted: m },
          );
        }
        break;
      }

      case "ban":
      case "banuser": {
        if (!text && !m.quoted) {
          await doReact("❌");
          return Venom.sendMessage(
            m.from,
            { text: `Please tag a user to *Ban*!` },
            { quoted: m },
          );
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const userId = mentionedUser || m.msg?.contextInfo?.participant;
        if (!userId) return m.reply("Please mention a valid user.");
        const chechBanStatus = await checkBan(userId);
        const checkUserModStatus = await checkMod(userId);
        const userNum = userId.split("@")[0];
        const globalOwner = global.owner;
        if (checkUserModStatus == true || globalOwner.includes(userNum)) {
          await doReact("❌");
          return m.reply(`Sorry, I can't ban an *Owner* or *Mod* !`);
        }
        if (userId === botNumber || userNum === botNumber.split("@")[0]) {
          await doReact("❌");
          return m.reply(`I cannot ban myself!`);
        }
        if (chechBanStatus) {
          await doReact("✅");
          return Venom.sendMessage(
            m.from,
            {
              text: `@${mentionedUser.split("@")[0]} is already *Banned* !`,
              mentions: [mentionedUser],
            },
            { quoted: m },
          );
        }
        try {
          await banUser(userId);
          await doReact("✅");
          await Venom.sendMessage(
            m.from,
            {
              text: `@${mentionedUser.split("@")[0]} has been *Banned* Successfully by *${pushName}*`,
              mentions: [mentionedUser],
            },
            { quoted: m },
          );
        } catch (err) {
          console.error("[ EXCEPTION ] ban error:", err.message);
          await doReact("❌");
          await m.reply(`Failed to ban user: ${err.message}`);
        }
        break;
      }

      case "unban":
      case "unbanuser": {
        if (!text && !m.quoted) {
          await doReact("❌");
          return m.reply(`Please tag a user to *Un-Ban*!`);
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const userId = mentionedUser || m.msg?.contextInfo?.participant;
        if (!userId) return m.reply("Please mention a valid user.");
        const chechBanStatus = await checkBan(userId);
        if (chechBanStatus) {
          try {
            await unbanUser(userId);
            await doReact("✅");
            await Venom.sendMessage(
              m.from,
              {
                text: `@${mentionedUser.split("@")[0]} has been *Un-Banned* Successfully by *${pushName}*`,
                mentions: [mentionedUser],
              },
              { quoted: m },
            );
          } catch (err) {
            console.error("[ EXCEPTION ] unban error:", err.message);
            await doReact("❌");
            await m.reply(`Failed to unban user: ${err.message}`);
          }
        } else {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `@${mentionedUser.split("@")[0]} is not *Banned* !`,
            mentions: [mentionedUser],
            quoted: m,
          });
        }
        break;
      }

      case "banlist":
      case "listbans": {
        await doReact("📋");
        try {
          const [bannedUsers, bannedGroups] = await Promise.all([
            userData.find({ ban: true }),
            groupData.find({ bangroup: true }),
          ]);

          if (!bannedUsers.length && !bannedGroups.length) {
            return Venom.sendMessage(
              m.from,
              { text: `  🚫  *${BRAND.botName} Ban List*  🚫\n\nNo banned users or groups.` },
              { quoted: m },
            );
          }

          let banlistText = `  🚫  *${BRAND.botName} Ban List*  🚫\n\n`;

          if (bannedUsers.length) {
            banlistText += `👤 *Banned Users* (${bannedUsers.length})\n\n`;
            bannedUsers.forEach((u, i) => {
              banlistText += `  ${i + 1}. @${u.id.split("@")[0]}\n`;
            });
          }

          if (bannedGroups.length) {
            if (bannedUsers.length) banlistText += "\n";
            banlistText += `👥 *Banned Groups* (${bannedGroups.length})\n\n`;
            for (let i = 0; i < bannedGroups.length; i++) {
              const gid = bannedGroups[i].id;
              let gname = gid;
              try {
                const meta = await Venom.groupMetadata(gid);
                gname = meta.subject || gid;
              } catch {}
              banlistText += `  ${i + 1}. ${gname}\n`;
            }
          }

          const mentions = bannedUsers.map((u) => u.id);
          await Venom.sendMessage(
            m.from,
            { text: banlistText, mentions },
            { quoted: m },
          );
        } catch (err) {
          console.error("[ EXCEPTION ] banlist error:", err.message);
          await doReact("❌");
          await m.reply(`An error occurred while fetching the ban list.`);
        }
        break;
      }

      case "setchar": {
        if (!text) {
          await doReact("❌");
          return Venom.sendMessage(
            m.from,
            { text: `Please enter a character number between 0-19 to set !` },
            { quoted: m },
          );
        }
        const chechSenderModStatus = modcheck;
        if (!chechSenderModStatus && !isCreator) {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `Sorry, only *Owners* and *Mods* can use this command !`,
            quoted: m,
          });
        }

        const intinput = parseInt(text);
        if (isNaN(intinput) || intinput < 0 || intinput > 19) {
          await doReact("❌");
          return Venom.sendMessage(
            m.from,
            { text: `Please enter a character number between 0-19 to set !` },
            { quoted: m },
          );
        }
        const botNames = [
          "Venom MD",
          "Power",
          "Makima",
          "Denji",
          "Zero Two",
          "Chika",
          "Miku",
          "Marin",
          "Ayanokoji",
          "Ruka",
          "Mizuhara",
          "Rem",
          "Sumi",
          "Kaguya",
          "Yumeko",
          "Kurumi",
          "Mai",
          "Yor",
          "Shinbou",
          "Eiko",
        ];
        const botLogos = [
          "https://wallpapercave.com/wp/wp5924545.jpg",
          "https://wallpapercave.com/wp/wp11253614.jpg",
          "https://images5.alphacoders.com/126/1264439.jpg",
          "https://i0.wp.com/metagalaxia.com.br/wp-content/uploads/2022/11/Chainsaw-Man-Denji-e-Power.webp?resize=1068%2C601&ssl=1",
          "https://images3.alphacoders.com/949/949253.jpg",
          "https://images4.alphacoders.com/100/1002134.png",
          "https://wallpapercave.com/wp/wp10524580.jpg",
          "https://images2.alphacoders.com/125/1257915.jpg",
          "https://wallpapers.com/images/file/kiyotaka-ayanokoji-in-pink-qs33qgqm79ccsq7n.jpg",
          "https://wallpapercave.com/wp/wp8228630.jpg",
          "https://images3.alphacoders.com/128/1288059.png",
          "https://images.alphacoders.com/711/711900.png",
          "https://moewalls.com/wp-content/uploads/2022/07/sumi-sakurasawa-hmph-rent-a-girlfriend-thumb.jpg",
          "https://wallpapercave.com/wp/wp6099650.png",
          "https://wallpapercave.com/wp/wp5017991.jpg",
          "https://wallpapercave.com/wp/wp2535489.jpg",
          "https://images4.alphacoders.com/972/972790.jpg",
          "https://images7.alphacoders.com/123/1236729.jpg",
          "https://wallpapercave.com/wp/wp4650481.jpg",
          "https://images8.alphacoders.com/122/1229829.jpg",
        ];

        const checkChar = await getChar();
        if (checkChar === intinput) {
          await doReact("✅");
          return Venom.sendMessage(
            m.from,
            {
              image: { url: botLogos[intinput] },
              caption: `Character number *${intinput}* - *${botNames[intinput]}* is already default !`,
            },
            { quoted: m },
          );
        }
        await doReact("✅");
        await setChar(intinput);
        await Venom.sendMessage(
          m.from,
          {
            image: { url: botLogos[intinput] },
            caption: `Character number *${intinput}* - *${botNames[intinput]}* has been set Successfully by *${pushName}*`,
          },
          { quoted: m },
        );
        break;
      }

      case "charlist":
      case "characters": {
        await doReact("📃");
        const botNames = [
          "Venom MD",
          "Power",
          "Makima",
          "Denji",
          "Zero Two",
          "Chika",
          "Miku",
          "Marin",
          "Ayanokoji",
          "Ruka",
          "Mizuhara",
          "Rem",
          "Sumi",
          "Kaguya",
          "Yumeko",
          "Kurumi",
          "Mai",
          "Yor",
          "Shinbou",
          "Eiko",
        ];
        let charListMenu = `  🎀  *${BRAND.botName} Characters*  🎀\n\n`;
        for (let i = 0; i < botNames.length; i++) {
          charListMenu += `  [ ${i} ] :  *${botNames[i]}*\n`;
        }
        charListMenu += `\n*Select a character ID and use* \`${prefix}setchar <ID>\` *to set it.*`;
        return Venom.sendMessage(m.from, { text: charListMenu }, { quoted: m });
      }

      case "dmchatbot":
      case "pmchatbot": {
        if (!text) {
          await doReact("❌");
          return m.reply(
            `Please provide On / Off action !\n\n*Example:*\n\n${prefix}pmchatbot on`,
          );
        }
        const chechSenderModStatus = modcheck;
        if (!chechSenderModStatus && !isCreator) {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `Sorry, only *Owners* and *Mods* can use this command !`,
            quoted: m,
          });
        }
        const pmChatBotStatus = await checkPmChatbot();
        await doReact("🧩");
        if (args[0] === "on") {
          if (pmChatBotStatus) {
            await doReact("❌");
            return Venom.sendMessage(m.from, {
              text: `Private Chatbot is already *Enabled* !`,
              quoted: m,
            });
          }
          await activateChatBot();
          await m.reply(
            `*PM Chatbot* has been *Enabled* Successfully ! \n\nBot will reply to all chats in PM !`,
          );
        } else if (args[0] === "off") {
          if (!pmChatBotStatus) {
            await doReact("❌");
            return Venom.sendMessage(m.from, {
              text: `Private Chatbot is already *Disabled* !`,
              quoted: m,
            });
          }
          await deactivateChatBot();
          await m.reply(`*PM Chatbot* has been *Disabled* Successfully !`);
        } else {
          await doReact("❌");
          return m.reply(
            `Please provide On / Off action !\n\n*Example:*\n\n${prefix}pmchatbot on`,
          );
        }
        break;
      }

      case "bangroup":
      case "bangc": {
        if (!m.isGroup) {
          await doReact("❌");
          return m.reply(`This command can only be used in groups !`);
        }
        const chechSenderModStatus = modcheck;
        if (!chechSenderModStatus && !isCreator) {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `Sorry, only *Owners* and *Mods* can use this command !`,
            quoted: m,
          });
        }
        const groupBanStatus = await checkBanGroup(m.from);
        if (groupBanStatus) {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `This group is already *Banned* !`,
            quoted: m,
          });
        }
        await doReact("🧩");
        await banGroup(m.from);
        await m.reply(`*${groupName}* has been *Banned* Successfully !`);
        break;
      }

      case "unbangroup":
      case "unbangc": {
        if (!m.isGroup) {
          await doReact("❌");
          return m.reply(`This command can only be used in groups !`);
        }
        const chechSenderModStatus = modcheck;
        if (!chechSenderModStatus && !isCreator) {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `Sorry, only *Owners* and *Mods* can use this command !`,
            quoted: m,
          });
        }
        const groupBanStatus = await checkBanGroup(m.from);
        if (!groupBanStatus) {
          await doReact("❌");
          return Venom.sendMessage(m.from, {
            text: `This group is not banned !`,
            quoted: m,
          });
        }
        await doReact("🧩");
        await unbanGroup(m.from);
        await m.reply(`*${groupName}* has been *Unbanned* Successfully !`);
        break;
      }

      case "setbotmode":
      case "mode": {
        if (!text) {
          await doReact("❌");
          return m.reply(
            `Please provide *Self / Private / Public* mode names !\n\n*Example:*\n\n${prefix}mode public`,
          );
        }
        if (!isCreator) {
          await doReact("❌");
          return m.reply("Only deployment owners can change the bot mode.");
        }
        const chechbotMode = await getBotMode();

        if (args[0] == "self") {
          if (chechbotMode == "self") {
            await doReact("❌");
            return m.reply(
              `Bot is already in *Self* mode !\n\nOnly *Bot Hoster (Bot number)* can use bot.`,
            );
          }
          await doReact("🧩");
          await setBotMode("self");
          await m.reply(`Bot has been set to *Self* mode Successfully !`);
        } else if (args[0] == "private") {
          if (chechbotMode == "private") {
            await doReact("❌");
            return m.reply(
              `Bot is already in *Private* mode !\n\nOnly bot *Owners / Mods* can use bot.`,
            );
          }
          await doReact("🧩");
          await setBotMode("private");
          await m.reply(`Bot has been set to *Private* mode Successfully !`);
        } else if (args[0] == "public") {
          if (chechbotMode == "public") {
            await doReact("❌");
            return m.reply(
              `Bot is already in *Public* mode !\n\nAnyone can use bot.`,
            );
          }
          await doReact("🧩");
          await setBotMode("public");
          await m.reply(`Bot has been set to *Public* mode Successfully !`);
        } else {
          await doReact("❌");
          return m.reply(
            `Please provide *Self / Private / Public* mode names !\n\n*Example:*\n\n${prefix}mode public`,
          );
        }
        break;
      }

      case "getcmd":
      case "getplugin":
      case "cmdfile": {
        if (!isCreator) {
          await doReact("❌");
          return m.reply("Only deployment owners can export command source files.");
        }
        if (!text) {
          return m.reply(`Example:\n\n${prefix}getcmd runtime`);
        }

        try {
          const pluginDir = "./Plugins";

          const files = fs.readdirSync(pluginDir);

          let foundFile = null;

          for (const file of files) {
            const data = fs.readFileSync(path.join(pluginDir, file), "utf8");

            if (data.includes(`"${text}"`) || data.includes(`'${text}'`)) {
              foundFile = file;
              break;
            }
          }

          if (!foundFile) {
            await doReact("❌");
            return m.reply("❌ Command plugin not found");
          }

          const filePath = path.join(pluginDir, foundFile);

          await doReact("🧩");
          await Venom.sendMessage(
            m.from,
            {
              document: fs.readFileSync(filePath),
              fileName: foundFile,
              mimetype: "text/javascript",
            },
            { quoted: m },
          );
        } catch (e) {
          await doReact("❌");
          m.reply(`Error: ${e.message}`);
        }

        break;
      }

      default:
        break;
    }
  },
};

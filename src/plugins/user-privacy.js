import { getContentType } from "baileys";

import { downloadMedia, mediaMessage, unwrapMessage } from "../message.js";
import { jidNumber } from "../utils.js";

async function imageSource(context) {
  const target = mediaMessage(context.details);
  const type = getContentType(unwrapMessage(target?.message));
  if (type !== "imageMessage") throw new Error("Send or reply to an image.");
  return downloadMedia(context.socket, target, context.config.maxMediaBytes);
}

function privacyValue(context, allowed) {
  const value = context.args[0]?.toLowerCase();
  if (!allowed.includes(value)) throw new Error(`Choose one of: ${allowed.join(", ")}.`);
  return value;
}

export default [
  {
    name: "bio",
    category: "user",
    description: "Show a user's visible WhatsApp bio.",
    usage: "bio [@user]",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      const result = await context.socket.fetchStatus(target);
      const data = Array.isArray(result) ? result[0]?.status : result?.status;
      const status = typeof data === "string" ? data : data?.status;
      await context.reply(`📝 @${jidNumber(target)}\n${status || "No visible bio."}`, { mentions: [target] });
    },
  },
  {
    name: "blocklist",
    category: "user",
    description: "Show blocked WhatsApp contacts (owner only).",
    ownerOnly: true,
    async execute(context) {
      const users = (await context.socket.fetchBlocklist()).filter(Boolean);
      await context.reply(`🚫 *BLOCKED CONTACTS*\n${users.map((jid) => `• @${jidNumber(jid)}`).join("\n") || "None"}`, { mentions: users });
    },
  },
  {
    name: "delete",
    category: "user",
    description: "Delete a quoted message when permissions allow.",
    async execute(context) {
      const key = context.details.quoted?.key;
      if (!key?.id) throw new Error("Reply to the message to delete.");
      await context.socket.sendMessage(context.chat, { delete: key });
    },
  },
  {
    name: "forward",
    category: "user",
    description: "Forward a quoted message back into the current chat.",
    async execute(context) {
      if (!context.details.quoted) throw new Error("Reply to a message to forward.");
      await context.socket.sendMessage(context.chat, { forward: context.details.quoted, force: true });
    },
  },
  {
    name: "markread",
    category: "user",
    description: "Mark the current message as read.",
    async execute(context) {
      await context.socket.readMessages([context.message.key]);
      await context.reply("✅ Marked as read.");
    },
  },
  {
    name: "pinchat",
    category: "user",
    description: "Pin the current chat (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.socket.chatModify({ pin: true }, context.chat);
      await context.reply("📌 Chat pinned.");
    },
  },
  {
    name: "unpinchat",
    category: "user",
    description: "Unpin the current chat (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.socket.chatModify({ pin: false }, context.chat);
      await context.reply("✅ Chat unpinned.");
    },
  },
  {
    name: "mute-chat",
    aliases: ["mutechat"],
    category: "user",
    description: "Mute the current chat for a selected number of hours (owner only).",
    usage: "mute-chat [hours]",
    ownerOnly: true,
    async execute(context) {
      const hours = Math.min(168, Math.max(1, Number.parseInt(context.args[0] || "8", 10) || 8));
      await context.socket.chatModify({ mute: Date.now() + hours * 3_600_000 }, context.chat);
      await context.reply(`🔕 Chat muted for ${hours} hour(s).`);
    },
  },
  {
    name: "unmute-chat",
    aliases: ["unmutechat"],
    category: "user",
    description: "Unmute the current chat (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.socket.chatModify({ mute: null }, context.chat);
      await context.reply("🔔 Chat unmuted.");
    },
  },
  {
    name: "archive",
    category: "user",
    description: "Archive the current chat (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.socket.chatModify({ archive: true, lastMessages: [context.message] }, context.chat);
      await context.reply("🗃️ Chat archived.").catch(() => {});
    },
  },
  {
    name: "unarchive",
    category: "user",
    description: "Unarchive the current chat (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.socket.chatModify({ archive: false, lastMessages: [context.message] }, context.chat);
      await context.reply("✅ Chat unarchived.");
    },
  },
  {
    name: "clearchat",
    category: "user",
    description: "Clear the current chat on the linked account (owner only).",
    ownerOnly: true,
    async execute(context) {
      if (context.args[0] !== "CONFIRM") throw new Error(`Use ${context.prefix}clearchat CONFIRM.`);
      await context.socket.chatModify({ clear: true, lastMessages: [context.message] }, context.chat);
    },
  },
  {
    name: "setpp",
    category: "user",
    description: "Set the bot's WhatsApp profile photo (owner only).",
    ownerOnly: true,
    async execute(context) {
      const image = await imageSource(context);
      await context.socket.updateProfilePicture(context.socket.user.id, image);
      await context.reply("✅ Profile photo updated.");
    },
  },
  {
    name: "removepp",
    category: "user",
    description: "Remove the bot's WhatsApp profile photo (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.socket.removeProfilePicture(context.socket.user.id);
      await context.reply("✅ Profile photo removed.");
    },
  },
  {
    name: "privacy",
    category: "privacy",
    description: "Show the linked account's current privacy settings (owner only).",
    ownerOnly: true,
    async execute(context) {
      const settings = await context.socket.fetchPrivacySettings(true);
      await context.reply(`🔐 *PRIVACY SETTINGS*\n${Object.entries(settings || {}).map(([name, value]) => `• ${name}: ${value}`).join("\n")}`);
    },
  },
  {
    name: "lastseen",
    category: "privacy",
    description: "Set last-seen privacy (owner only).",
    usage: "lastseen all|contacts|none",
    ownerOnly: true,
    async execute(context) {
      const value = privacyValue(context, ["all", "contacts", "none"]);
      await context.socket.updateLastSeenPrivacy(value);
      await context.reply(`✅ Last-seen privacy: ${value}.`);
    },
  },
  {
    name: "presence",
    category: "privacy",
    description: "Set online presence privacy (owner only).",
    usage: "presence all|match_last_seen",
    ownerOnly: true,
    async execute(context) {
      const value = privacyValue(context, ["all", "match_last_seen"]);
      await context.socket.updateOnlinePrivacy(value);
      await context.reply(`✅ Online privacy: ${value}.`);
    },
  },
  {
    name: "mypp",
    category: "privacy",
    description: "Set profile-photo privacy (owner only).",
    usage: "mypp all|contacts|none",
    ownerOnly: true,
    async execute(context) {
      const value = privacyValue(context, ["all", "contacts", "none"]);
      await context.socket.updateProfilePicturePrivacy(value);
      await context.reply(`✅ Profile-photo privacy: ${value}.`);
    },
  },
  {
    name: "mystatus",
    category: "privacy",
    description: "Set status privacy (owner only).",
    usage: "mystatus all|contacts|none",
    ownerOnly: true,
    async execute(context) {
      const value = privacyValue(context, ["all", "contacts", "none"]);
      await context.socket.updateStatusPrivacy(value);
      await context.reply(`✅ Status privacy: ${value}.`);
    },
  },
  {
    name: "read",
    category: "privacy",
    description: "Set read-receipt privacy (owner only).",
    usage: "read all|none",
    ownerOnly: true,
    async execute(context) {
      const value = privacyValue(context, ["all", "none"]);
      await context.socket.updateReadReceiptsPrivacy(value);
      await context.reply(`✅ Read receipts: ${value}.`);
    },
  },
  {
    name: "allow-gcadd",
    category: "privacy",
    description: "Set who may add the account to groups (owner only).",
    usage: "allow-gcadd all|contacts|contact_blacklist",
    ownerOnly: true,
    async execute(context) {
      const value = privacyValue(context, ["all", "contacts", "contact_blacklist"]);
      await context.socket.updateGroupsAddPrivacy(value);
      await context.reply(`✅ Group-add privacy: ${value}.`);
    },
  },
];

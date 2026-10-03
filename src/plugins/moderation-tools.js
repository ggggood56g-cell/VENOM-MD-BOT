import { messageDetails } from "../message.js";
import { jidNumber, normalizeJid } from "../utils.js";

function deletedSummary(entry) {
  if (!entry) return null;
  const details = entry.details;
  const type = String(details.type || "message").replace("Message", "");
  const who = details.fromMe ? "the bot" : `@${jidNumber(details.sender)}`;
  const text = details.text ? `\n\n"${details.text.slice(0, 800)}"` : "";
  return { caption: `🗑️ *Deleted ${type}* from ${who}${text}`, raw: entry.raw, mentions: details.fromMe ? [] : [details.sender] };
}

export default [
  {
    name: "snipe",
    category: "tools",
    description: "Recover the last message deleted in this chat.",
    async execute(context) {
      const entry = context.runtime?.deletedLog?.get?.(context.chat);
      const summary = deletedSummary(entry);
      if (!summary) throw new Error("Nothing was deleted recently.");
      await context.socket.sendMessage(context.chat, { text: summary.caption, mentions: summary.mentions }, { quoted: summary.raw });
    },
  },
  {
    name: "editsnipe",
    category: "tools",
    description: "Show the last message edited in this chat.",
    async execute(context) {
      const entry = context.runtime?.editLog?.get?.(context.chat);
      if (!entry) throw new Error("Nothing was edited recently.");
      await context.reply(
        `✏️ *@${jidNumber(entry.who)} edited a message:*\n\nBefore: "${String(entry.before || "").slice(0, 600) || "(media)"}"\n\nAfter: "${String(entry.after || "").slice(0, 600) || "(media)"}"`,
        { mentions: [entry.who] },
      );
    },
  },
  {
    name: "antidelete",
    category: "config",
    description: "Repost messages that users delete (owner only).",
    usage: "antidelete on|off",
    ownerOnly: true,
    async execute(context) {
      const value = context.args[0]?.toLowerCase();
      if (!["on", "off"].includes(value)) throw new Error(`Use ${context.prefix}antidelete on or off.`);
      await context.store.setFeature("antiDelete", value === "on");
      await context.reply(`✅ Anti-delete: *${value}*`);
    },
  },
  {
    name: "antiedit",
    category: "config",
    description: "Warn when users edit messages (owner only).",
    usage: "antiedit on|off",
    ownerOnly: true,
    async execute(context) {
      const value = context.args[0]?.toLowerCase();
      if (!["on", "off"].includes(value)) throw new Error(`Use ${context.prefix}antiedit on or off.`);
      await context.store.setFeature("antiEdit", value === "on");
      await context.reply(`✅ Anti-edit: *${value}*`);
    },
  },
  {
    name: "antieditchat",
    category: "config",
    description: "Send deleted message logs to a chat (owner only).",
    usage: "antieditchat <chat jid or off>",
    ownerOnly: true,
    async execute(context) {
      const value = context.args[0]?.toLowerCase();
      if (value === "off") {
        await context.store.deleteRuntimeVar("antideleteLog");
        await context.reply("✅ Delete logging cleared.");
        return;
      }
      const target = context.details.quoted?.key?.remoteJid || context.mentionedJids[0] || context.chat;
      await context.store.setRuntimeVar("antideleteLog", normalizeJid(target));
      await context.reply(`✅ Deleted messages will be logged to ${normalizeJid(target)}`);
    },
  },
  {
    name: "listonline",
    groupOnly: true,
    category: "group",
    description: "List group members currently online.",
    async execute(context) {
      const presences = context.runtime?.presenceLog?.get?.(context.chat) || {};
      const online = Object.entries(presences).filter(([, state]) => state === "available");
      if (!online.length) {
        await context.reply("🟢 No online members tracked yet. Presence data updates as people chat.");
        return;
      }
      await context.reply(`🟢 *ONLINE (${online.length})*\n${online.map(([jid]) => `• @${jidNumber(jid)}`).join("\n")}`, {
        mentions: online.map(([jid]) => jid),
      });
    },
  },
  {
    name: "listoffline",
    groupOnly: true,
    category: "group",
    description: "List group members known to be offline.",
    async execute(context) {
      const presences = context.runtime?.presenceLog?.get?.(context.chat) || {};
      const offline = Object.entries(presences).filter(([, state]) => state === "unavailable");
      if (!offline.length) {
        await context.reply("⚪ No offline members tracked yet.");
        return;
      }
      await context.reply(`⚪ *OFFLINE (${offline.length})*\n${offline.map(([jid]) => `• @${jidNumber(jid)}`).join("\n")}`, {
        mentions: offline.map(([jid]) => jid),
      });
    },
  },
  {
    name: "onlinestatus",
    category: "tools",
    description: "Check the last known presence of a member.",
    usage: "onlinestatus @user",
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention a user or reply to them.");
      const presences = context.runtime?.presenceLog?.get?.(context.chat) || {};
      const state = presences[normalizeJid(target)];
      const label = state === "available" ? "online 🟢" : state ? `${state} ⚪` : "not tracked yet";
      await context.reply(`👀 @${jidNumber(target)} is ${label}.`, { mentions: [target] });
    },
  },
  {
    name: "savestatus",
    category: "user",
    description: "Save the latest status of a contact.",
    usage: "savestatus [@user]",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      const statuses = context.runtime?.statusLog?.get?.(normalizeJid(target)) || [];
      const latest = statuses[statuses.length - 1];
      if (!latest) throw new Error("No recent status from that contact has reached the bot.");
      const { key, message } = latest;
      await context.socket.sendMessage(context.chat, { forward: { key, message } }, { quoted: context.details.raw });
      await context.reply(`📲 Status from @${jidNumber(target)} forwarded.`, { mentions: [target] });
    },
  },
  {
    name: "statusemoji",
    category: "config",
    description: "Choose the emoji used to react to statuses.",
    usage: "statusemoji <emoji>",
    ownerOnly: true,
    async execute(context) {
      const emoji = [...context.query.trim()][0];
      if (!emoji) throw new Error(`Send an emoji, for example ${context.prefix}statusemoji 💚`);
      await context.store.setRuntimeVar("statusEmoji", emoji);
      await context.reply(`✅ Status reactions now use ${emoji}`);
    },
  },
];

import { randomUUID } from "node:crypto";

import { messageText } from "../message.js";
import { formatDuration, jidNumber } from "../utils.js";

function parseDuration(value) {
  const match = String(value || "").toLowerCase().match(/^(\d{1,6})(s|m|h|d)$/);
  if (!match) return 0;
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Number(match[1]) * multiplier;
}

async function createReminder(context) {
  const [durationText, ...parts] = context.query.split("|").map((value) => value.trim());
  const duration = parseDuration(durationText);
  const text = parts.join(" | ");
  if (duration < 10_000 || duration > 365 * 86_400_000 || !text) {
    throw new Error(`Use: ${context.prefix}${context.command.name} 10m | reminder text`);
  }
  const reminder = {
    id: randomUUID().slice(0, 8),
    owner: context.sender,
    chat: context.chat,
    text,
    dueAt: Date.now() + duration,
  };
  await context.store.addReminder(reminder);
  await context.reply(`⏰ Reminder *${reminder.id}* set for ${formatDuration(duration / 1_000)}.`);
}

const ELEMENTS = {
  h: "Hydrogen (H) — atomic number 1",
  he: "Helium (He) — atomic number 2",
  c: "Carbon (C) — atomic number 6",
  n: "Nitrogen (N) — atomic number 7",
  o: "Oxygen (O) — atomic number 8",
  na: "Sodium (Na) — atomic number 11",
  al: "Aluminium (Al) — atomic number 13",
  si: "Silicon (Si) — atomic number 14",
  fe: "Iron (Fe) — atomic number 26",
  cu: "Copper (Cu) — atomic number 29",
  ag: "Silver (Ag) — atomic number 47",
  au: "Gold (Au) — atomic number 79",
};

export default [
  {
    name: "afk",
    category: "tools",
    description: "Mark yourself as away and notify people who mention you.",
    usage: "afk [reason]",
    async execute(context) {
      const afk = await context.store.setAfk(context.sender, context.query || "Away");
      await context.reply(`💤 You are now AFK: ${afk.reason}`);
    },
  },
  {
    name: "areact",
    category: "tools",
    description: "React to the quoted or current message.",
    usage: "areact ❤️",
    async execute(context) {
      const emoji = context.args[0] || "❤️";
      const key = context.details.quoted?.key || context.message.key;
      await context.socket.sendMessage(context.chat, { react: { text: emoji, key } });
    },
  },
  {
    name: "setcmd",
    aliases: ["savecmd"],
    category: "tools",
    description: "Create a persistent text-response command (owner only).",
    usage: "setcmd name | response",
    ownerOnly: true,
    async execute(context) {
      const [name, ...parts] = context.query.split("|").map((value) => value.trim());
      if (context.registry.find(name)) throw new Error("That name belongs to a built-in command.");
      await context.store.setCustomCommand(name, parts.join(" | "));
      await context.reply(`✅ Custom command *${context.prefix}${name}* saved.`);
    },
  },
  {
    name: "delcmd",
    category: "tools",
    description: "Delete one custom command (owner only).",
    usage: "delcmd <name>",
    ownerOnly: true,
    async execute(context) {
      if (!(await context.store.deleteCustomCommand(context.args[0]))) throw new Error("Custom command not found.");
      await context.reply("✅ Custom command deleted.");
    },
  },
  {
    name: "delcmds",
    category: "tools",
    description: "Delete every custom command (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.store.clearCustomCommands();
      await context.reply("✅ All custom commands deleted.");
    },
  },
  {
    name: "listcmd",
    aliases: ["listcommands"],
    category: "tools",
    description: "List persistent custom commands.",
    async execute(context) {
      const commands = Object.keys(context.store.customCommands());
      await context.reply(`🧩 *CUSTOM COMMANDS*\n${commands.map((name) => `• ${context.prefix}${name}`).join("\n") || "None"}`);
    },
  },
  {
    name: "remind",
    aliases: ["reminder"],
    category: "tools",
    description: "Create a persistent timed reminder.",
    usage: "remind 10m | text",
    execute: createReminder,
  },
  {
    name: "schedule",
    category: "tools",
    description: "Schedule a persistent reminder.",
    usage: "schedule 2h | text",
    execute: createReminder,
  },
  {
    name: "reminders",
    aliases: ["reminderlist"],
    category: "tools",
    description: "List your pending reminders.",
    async execute(context) {
      const reminders = context.store.reminders(context.sender);
      await context.reply(`⏰ *REMINDERS*\n${reminders.map((item) => `• ${item.id} — ${new Date(item.dueAt).toLocaleString("en-NG", { timeZone: context.config.timezone })}\n  ${item.text}`).join("\n") || "None"}`);
    },
  },
  {
    name: "delremind",
    category: "tools",
    description: "Delete a pending reminder.",
    usage: "delremind <id>",
    async execute(context) {
      if (!(await context.store.deleteReminder(context.sender, context.args[0]))) throw new Error("Reminder not found.");
      await context.reply("✅ Reminder deleted.");
    },
  },
  {
    name: "quoted",
    category: "tools",
    description: "Show the text contained in a quoted message.",
    async execute(context) {
      if (!context.details.quoted) throw new Error("Reply to a message.");
      await context.reply(`💬 *QUOTED TEXT*\n${messageText(context.details.quoted) || "No text content."}`);
    },
  },
  {
    name: "quotedinfo",
    category: "tools",
    description: "Show safe metadata for a quoted message.",
    async execute(context) {
      const quoted = context.details.quoted;
      if (!quoted) throw new Error("Reply to a message.");
      await context.reply(`ℹ️ Message ID: ${quoted.key.id || "unknown"}\nSender: ${quoted.key.participant || "unknown"}\nChat: ${quoted.key.remoteJid}`);
    },
  },
  {
    name: "mention",
    category: "tools",
    description: "Mention a selected user with text.",
    usage: "mention @user [text]",
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention or quote a user.");
      await context.reply(`@${jidNumber(target)} ${context.query.replace(/@\d+/g, "").trim()}`, { mentions: [target] });
    },
  },
  {
    name: "msgs",
    category: "tools",
    description: "Show messages processed since startup.",
    async execute(context) {
      await context.reply(`📨 Messages processed: *${context.runtime.messageCount.toLocaleString()}*`);
    },
  },
  {
    name: "element",
    category: "tools",
    description: "Look up a common chemical element symbol.",
    usage: "element Au",
    async execute(context) {
      const element = ELEMENTS[context.args[0]?.toLowerCase()];
      if (!element) throw new Error(`Known symbols: ${Object.keys(ELEMENTS).join(", ")}`);
      await context.reply(`⚛️ ${element}`);
    },
  },
  {
    name: "ison",
    category: "tools",
    description: "Check whether a phone number is registered on WhatsApp.",
    usage: "ison 2348012345678",
    async execute(context) {
      const number = String(context.args[0] || "").replace(/\D/g, "");
      if (number.length < 7 || number.length > 15) throw new Error("Enter a full phone number with country code.");
      const [result] = await context.socket.onWhatsApp(number);
      await context.reply(result?.exists ? `✅ +${number} is on WhatsApp.` : `❌ +${number} was not found on WhatsApp.`);
    },
  },
  {
    name: "permit",
    category: "tools",
    description: "Restore a user's bot access (owner only).",
    usage: "permit @user",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention or quote a user.");
      await context.store.setBanned(target, false);
      await context.reply(`✅ @${jidNumber(target)} may use commands.`, { mentions: [target] });
    },
  },
];

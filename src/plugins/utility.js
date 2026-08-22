import crypto from "node:crypto";

import { calculate } from "../services/calculator.js";
import { jidNumber, randomItem } from "../utils.js";

export default [
  {
    name: "calc",
    aliases: ["calculate"],
    category: "utility",
    description: "Safely calculate a mathematical expression.",
    usage: "calc (12 + 8) / 4",
    async execute(context) {
      if (!context.query) throw new Error("Enter a calculation.");
      await context.reply(`🧮 *Result:* ${calculate(context.query)}`);
    },
  },
  {
    name: "time",
    category: "utility",
    description: "Show the current local time.",
    async execute(context) {
      const value = new Intl.DateTimeFormat("en-NG", {
        timeZone: context.config.timezone,
        timeStyle: "medium",
      }).format(new Date());
      await context.reply(`🕒 ${value}\n${context.config.timezone}`);
    },
  },
  {
    name: "date",
    category: "utility",
    description: "Show today's local date.",
    async execute(context) {
      const value = new Intl.DateTimeFormat("en-NG", {
        timeZone: context.config.timezone,
        dateStyle: "full",
      }).format(new Date());
      await context.reply(`📅 ${value}`);
    },
  },
  {
    name: "choose",
    aliases: ["pick"],
    category: "utility",
    description: "Choose one option randomly.",
    usage: "choose rice | pasta | yam",
    async execute(context) {
      const options = context.query.split("|").map((item) => item.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 20) throw new Error("Separate 2–20 choices with | characters.");
      await context.reply(`🎯 I choose: *${randomItem(options)}*`);
    },
  },
  {
    name: "coin",
    aliases: ["flip"],
    category: "utility",
    description: "Flip a virtual coin.",
    async execute(context) {
      await context.reply(`🪙 *${Math.random() < 0.5 ? "Heads" : "Tails"}*`);
    },
  },
  {
    name: "dice",
    category: "utility",
    description: "Roll a six-sided die.",
    async execute(context) {
      await context.reply(`🎲 You rolled *${1 + Math.floor(Math.random() * 6)}*.`);
    },
  },
  {
    name: "jid",
    aliases: ["id"],
    category: "utility",
    description: "Show this chat and sender identifier.",
    async execute(context) {
      await context.reply(`Chat: ${context.chat}\nSender: ${context.sender}`);
    },
  },
  {
    name: "number",
    aliases: ["whois"],
    category: "utility",
    description: "Show the number of a mentioned or quoted user.",
    usage: "number @user",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      await context.reply(`📱 +${jidNumber(target)}`);
    },
  },
  {
    name: "password",
    aliases: ["passgen"],
    category: "utility",
    description: "Generate a strong random password.",
    async execute(context) {
      const password = crypto.randomBytes(18).toString("base64url");
      await context.reply(`🔐 *Generated password*\n${password}\n\nKeep it private.`);
    },
  },
  {
    name: "avatar",
    aliases: ["pp", "profilepic"],
    category: "utility",
    description: "Fetch a user's visible profile photo.",
    usage: "avatar @user",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      let url;
      try {
        url = await context.socket.profilePictureUrl(target, "image");
      } catch {
        throw new Error("That profile photo is unavailable or private.");
      }
      await context.send({ image: { url }, caption: `Profile photo for +${jidNumber(target)}` });
    },
  },
];

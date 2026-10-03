import { jidNumber, randomItem } from "../utils.js";

const TRUTHS = [
  "What is something you are proud of but rarely mention?",
  "What is the kindest thing someone has done for you?",
  "What habit would you most like to change?",
  "What was your funniest childhood mistake?",
  "Who inspires you the most, and why?",
];
const DARES = [
  "Send a voice note singing one line of your favorite song.",
  "Write a sincere compliment to the last person who messaged you.",
  "Use only emojis in your next three messages.",
  "Tell the group your best clean joke.",
  "Change your status to something positive for ten minutes.",
];
const JOKES = [
  "Why did the developer go broke? Because they used up all their cache.",
  "I told my computer I needed a break. It said: no problem, I’ll go to sleep.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "A SQL query walks into a bar, sees two tables, and asks: may I join you?",
];
const ANSWERS = [
  "Absolutely.",
  "Very likely.",
  "Ask again after some rest.",
  "The signs point to no.",
  "Focus, then try again.",
  "Yes—but plan carefully.",
];

export default [
  {
    name: "truth",
    category: "fun",
    description: "Get a clean truth question.",
    async execute(context) {
      await context.reply(`💬 *TRUTH*\n${randomItem(TRUTHS)}`);
    },
  },
  {
    name: "dare",
    category: "fun",
    description: "Get a safe, clean dare.",
    async execute(context) {
      await context.reply(`🔥 *DARE*\n${randomItem(DARES)}`);
    },
  },
  {
    name: "joke",
    category: "fun",
    description: "Get a random tech joke.",
    async execute(context) {
      await context.reply(`😄 ${randomItem(JOKES)}`);
    },
  },
  {
    name: "8ball",
    aliases: ["ask"],
    category: "fun",
    description: "Ask the magic ball a question.",
    usage: "8ball will today be great?",
    async execute(context) {
      if (!context.query) throw new Error("Ask a question first.");
      await context.reply(`🎱 ${randomItem(ANSWERS)}`);
    },
  },
  {
    name: "rate",
    category: "fun",
    description: "Give something a playful score.",
    usage: "rate my outfit",
    async execute(context) {
      if (!context.query) throw new Error("Tell me what to rate.");
      await context.reply(`⭐ I rate *${context.query}* ${Math.floor(Math.random() * 101)}/100.`);
    },
  },
  {
    name: "ship",
    category: "fun",
    description: "Calculate a playful compatibility score.",
    usage: "ship @user",
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention or quote someone.");
      const score = Math.floor(Math.random() * 101);
      await context.reply(
        `💞 @${jidNumber(context.sender)} × @${jidNumber(target)}\nCompatibility: *${score}%*`,
        { mentions: [context.sender, target] },
      );
    },
  },
  {
    name: "compliment",
    category: "fun",
    description: "Send a positive compliment.",
    usage: "compliment @user",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      const compliments = [
        "Your energy makes conversations better.",
        "You have a gift for making people feel welcome.",
        "Your determination is genuinely inspiring.",
        "You bring thoughtful ideas to the room.",
      ];
      await context.reply(`✨ @${jidNumber(target)}, ${randomItem(compliments)}`, {
        mentions: [target],
      });
    },
  },
];

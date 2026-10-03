import { randomItem } from "../utils.js";

const ADVICE = [
  "Make the next step small enough that you can start it today.",
  "Ask for clarity before assuming the worst.",
  "Protect your attention; it is one of your most valuable resources.",
  "Consistency usually beats intensity that cannot be sustained.",
  "Write important decisions down before emotions rewrite them.",
];
const FACTS = [
  "Octopuses have three hearts and blue blood.",
  "A day on Venus is longer than a year on Venus.",
  "Honey can remain edible for thousands of years when properly sealed.",
  "The human brain uses roughly one fifth of the body's resting energy.",
  "Nigeria is home to more than 500 spoken languages.",
];
const QUOTES = [
  ["The secret of getting ahead is getting started.", "Mark Twain"],
  ["It always seems impossible until it’s done.", "Nelson Mandela"],
  ["Success is the sum of small efforts repeated day in and day out.", "Robert Collier"],
  ["We become what we think about most of the time.", "Earl Nightingale"],
  ["Do what you can, with what you have, where you are.", "Theodore Roosevelt"],
];

export default [
  {
    name: "advice",
    category: "misc",
    description: "Get a short piece of practical advice.",
    async execute(context) {
      await context.reply(`💡 ${randomItem(ADVICE)}`);
    },
  },
  {
    name: "fact",
    category: "misc",
    description: "Get an interesting verified general fact.",
    async execute(context) {
      await context.reply(`🧠 ${randomItem(FACTS)}`);
    },
  },
  {
    name: "quote",
    aliases: ["q"],
    category: "misc",
    description: "Get an inspirational quote.",
    async execute(context) {
      const [quote, author] = randomItem(QUOTES);
      await context.reply(`“${quote}”\n— *${author}*`);
    },
  },
  {
    name: "ebinary",
    category: "misc",
    description: "Encode text as UTF-8 binary bytes.",
    usage: "ebinary Hello",
    async execute(context) {
      if (!context.query || context.query.length > 500) throw new Error("Enter up to 500 characters.");
      const encoded = [...Buffer.from(context.query, "utf8")].map((byte) => byte.toString(2).padStart(8, "0")).join(" ");
      await context.reply(encoded);
    },
  },
  {
    name: "dbinary",
    category: "misc",
    description: "Decode space-separated binary bytes.",
    usage: "dbinary 01001000 01101001",
    async execute(context) {
      const bytes = context.query.trim().split(/\s+/);
      if (!bytes.length || bytes.length > 2_000 || !bytes.every((byte) => /^[01]{8}$/.test(byte))) {
        throw new Error("Enter space-separated 8-bit binary values.");
      }
      await context.reply(Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2))).toString("utf8"));
    },
  },
  {
    name: "flipcoin",
    category: "misc",
    description: "Flip a coin without placing an economy bet.",
    async execute(context) {
      await context.reply(`🪙 *${Math.random() < 0.5 ? "HEADS" : "TAILS"}*`);
    },
  },
  {
    name: "rolldice",
    category: "misc",
    description: "Roll one or more six-sided dice.",
    usage: "rolldice [1-10]",
    async execute(context) {
      const count = Math.min(10, Math.max(1, Number.parseInt(context.args[0] || "1", 10) || 1));
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
      await context.reply(`🎲 ${rolls.join(" • ")}\nTotal: *${rolls.reduce((sum, value) => sum + value, 0)}*`);
    },
  },
];

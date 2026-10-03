import { fetchBuffer, fetchJson } from "../services/http.js";
import { addStickerMetadata, imageToSticker } from "../services/media.js";
import { jidNumber, randomItem } from "../utils.js";

const ENDPOINTS = {
  airkiss: "kiss",
  angrystare: "stare",
  bite: "bite",
  blush: "blush",
  brofist: "highfive",
  celebrate: "happy",
  clap: "happy",
  confused: "think",
  cool: "smug",
  cry: "cry",
  cuddle: "cuddle",
  dance: "dance",
  duck: "smile",
  evillaugh: "laugh",
  facepalm: "facepalm",
  feed: "feed",
  fox: "smile",
  handhold: "handhold",
  happy: "happy",
  hug: "hug",
  kiss: "kiss",
  laugh: "laugh",
  lick: "nom",
  love: "kiss",
  mad: "stare",
  meow: "smile",
  nervous: "think",
  nuzzle: "cuddle",
  pat: "pat",
  pinch: "poke",
  poke: "poke",
  pout: "pout",
  punch: "punch",
  sad: "cry",
  scared: "think",
  shrug: "shrug",
  shy: "blush",
  slap: "slap",
  sleep: "sleep",
  smack: "slap",
  smug: "smug",
  stare: "stare",
  thumbsup: "thumbsup",
  tickle: "tickle",
  wave: "wave",
  wink: "wink",
  woof: "happy",
  yawn: "yawn",
};

async function sendReaction(context, command, endpoint) {
  const payload = await fetchJson(`https://nekos.best/api/v2/${endpoint}?amount=1`, {
    allowedHosts: ["nekos.best"],
    maximumBytes: 512 * 1024,
  });
  const result = payload.results?.[0];
  if (!result?.url) throw new Error("Reaction service returned no media.");
  const { buffer } = await fetchBuffer(result.url, {
    allowedHosts: ["nekos.best"],
    maximumBytes: context.config.maxMediaBytes,
  });
  const target = context.targetJid();
  const caption = target
    ? `✨ @${jidNumber(context.sender)} ${command.replace(/([a-z])([A-Z])/g, "$1 $2")}s @${jidNumber(target)}`
    : `✨ *${command.toUpperCase()}*`;
  const sticker = await addStickerMetadata(
    await imageToSticker(buffer),
    context.config.packname,
    context.config.author,
  );
  await context.reply(caption, { mentions: target ? [context.sender, target] : [] });
  await context.send({ sticker });
}

const PICKUP_LINES = [
  "Are you a Wi-Fi signal? Because I’m feeling a strong connection.",
  "Do you have a map? I keep getting lost in your smile.",
  "You must be a great idea, because I can’t stop thinking about you.",
  "Are you made of copper and tellurium? Because you’re Cu-Te.",
];
const WOULD_YOU_RATHER = [
  "Would you rather travel ten years into the past or ten years into the future?",
  "Would you rather always know when someone is lying or always get away with lying?",
  "Would you rather have unlimited books or unlimited movies?",
  "Would you rather explore the deepest ocean or outer space?",
];
const INSULTS = [
  "You bring everyone so much joy… when you leave the group chat.",
  "Your secrets are always safe with me—I never listen anyway.",
  "You have something on your chin… no, the third one down.",
  "You’re proof that even autocorrect sometimes gives up.",
];
const HOROSCOPES = [
  "A small opportunity deserves your full attention today.",
  "Choose patience over pressure; clarity will follow.",
  "A helpful conversation may change your next step.",
  "Protect your energy and finish one important task first.",
];

export default [
  ...Object.entries(ENDPOINTS).map(([name, endpoint]) => ({
    name,
    category: "fun",
    description: `Send an anime ${name} reaction.`,
    usage: `${name} [@user]`,
    execute: (context) => sendReaction(context, name, endpoint),
  })),
  {
    name: "pickupline",
    category: "fun",
    description: "Get a clean pickup line.",
    async execute(context) {
      await context.reply(`💘 ${randomItem(PICKUP_LINES)}`);
    },
  },
  {
    name: "wyr",
    category: "fun",
    description: "Get a would-you-rather question.",
    async execute(context) {
      await context.reply(`🤔 *WOULD YOU RATHER*\n${randomItem(WOULD_YOU_RATHER)}`);
    },
  },
  {
    name: "insult",
    category: "fun",
    description: "Send a playful, non-hateful roast.",
    usage: "insult [@user]",
    async execute(context) {
      const target = context.targetJid();
      await context.reply(
        `${target ? `@${jidNumber(target)}, ` : ""}${randomItem(INSULTS)}`,
        { mentions: target ? [target] : [] },
      );
    },
  },
  {
    name: "horoscope",
    category: "fun",
    description: "Get a lighthearted horoscope message.",
    usage: "horoscope [sign]",
    async execute(context) {
      await context.reply(`🔮 *${(context.args[0] || "Today").toUpperCase()}*\n${randomItem(HOROSCOPES)}`);
    },
  },
  {
    name: "emojimix",
    category: "fun",
    description: "Create a playful combination from two emoji.",
    usage: "emojimix 😀 🔥",
    async execute(context) {
      const [first, second] = context.args;
      if (!first || !second) throw new Error("Enter two emoji.");
      await context.reply(`${first} ＋ ${second} ＝ ${first}${second}\n✨ Emoji fusion complete!`);
    },
  },
  {
    name: "pokemon",
    category: "fun",
    description: "Look up a Pokémon by name or number.",
    usage: "pokemon pikachu",
    async execute(context) {
      if (!context.args[0]) throw new Error("Enter a Pokémon name or number.");
      const name = context.args[0].toLowerCase().replace(/[^a-z0-9-]/g, "");
      const pokemon = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${name}`, {
        allowedHosts: ["pokeapi.co"],
        maximumBytes: 1024 * 1024,
      });
      const imageUrl = pokemon.sprites?.other?.["official-artwork"]?.front_default;
      const caption = [
        `⚡ *${pokemon.name.toUpperCase()}* #${pokemon.id}`,
        `Types: ${pokemon.types.map((item) => item.type.name).join(", ")}`,
        `Height: ${pokemon.height / 10} m`,
        `Weight: ${pokemon.weight / 10} kg`,
        `Abilities: ${pokemon.abilities.map((item) => item.ability.name).join(", ")}`,
      ].join("\n");
      if (!imageUrl) return context.reply(caption);
      const { buffer } = await fetchBuffer(imageUrl, {
        allowedHosts: ["raw.githubusercontent.com"],
        maximumBytes: context.config.maxMediaBytes,
      });
      await context.send({ image: buffer, caption });
    },
  },
];

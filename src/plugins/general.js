import { formatDuration } from "../utils.js";

const CATEGORY_LABELS = {
  general: "HELP",
  ai: "AI",
  anime: "ANIME",
  fun: "FUN",
  download: "DOWNLOADER",
  converter: "CONVERTER",
  search: "SEARCH",
  economy: "ECONOMY",
  textmaker: "TEXTMAKER",
  game: "GAME",
  group: "GROUP",
  tools: "TOOLS",
  image: "IMAGE",
  "image-meme": "IMAGE-MEME",
  media: "MEDIA",
  bot: "BOT",
  process: "PROCESS",
  misc: "MISC",
  utility: "UTILITIES",
  plugins: "PLUGINS",
  config: "CONFIG",
  user: "USER",
  privacy: "PRIVACY",
  autoreply: "AUTOREPLY",
  owner: "OWNER CONTROL",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

function italic(value) {
  return [...String(value)].map((character) => {
    const code = character.codePointAt(0);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d622 + code - 97);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d608 + code - 65);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7e2 + code - 48);
    return character;
  }).join("");
}

function monospaceUpper(value) {
  return [...String(value).toUpperCase()].map((character) => {
    const code = character.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d670 + code - 65);
    return character;
  }).join("");
}

function longUptime(totalSeconds) {
  let seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [
    days ? `${days} day${days === 1 ? "" : "s"}` : "",
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "",
    `${seconds} second${seconds === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" ");
}

function memoryText() {
  const bytes = process.memoryUsage().rss;
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function menuHeader(context) {
  return [
    `┌────═━┈ ${context.config.botName} ┈━═────┐`,
    ` ✇ ▸ Creator: ${context.config.ownerName}`,
    ` ✇ ▸ Number: ${context.config.owners[0]}`,
    ` ✇ ▸ User: ${context.details.pushName || "USER"}`,
    ` ✇ ▸ Plugins: ${context.registry.list().length}`,
    ` ✇ ▸ Uptime: ${longUptime(process.uptime())}`,
    ` ✇ ▸ Memory: ${memoryText()}`,
    ` ✇ ▸ Version: ${context.config.version}`,
    ` ✇ ▸ Platform: ${context.config.platform}`,
    "└───────═━┈┈━═──────┘",
  ].join("\n");
}

function categorySection(category, commands) {
  return [
    `┏ ${monospaceUpper(CATEGORY_LABELS[category] || category)} ┓`,
    "┍   ─┉─ • ─┉─    ┑",
    ...commands.map((command) => `│ ${italic(command.name)}`),
    "┕    ─┉─ • ─┉─   ┙",
  ].join("\n");
}

function groupedCommands(context) {
  const groups = new Map();
  for (const command of context.registry.list()) {
    if (command.hidden) continue;
    if (!groups.has(command.category)) groups.set(command.category, []);
    groups.get(command.category).push(command);
  }
  return [...groups.entries()].sort(([first], [second]) => {
    const firstIndex = CATEGORY_ORDER.indexOf(first);
    const secondIndex = CATEGORY_ORDER.indexOf(second);
    return (firstIndex < 0 ? 999 : firstIndex) - (secondIndex < 0 ? 999 : secondIndex);
  });
}

async function sendMenu(context) {
  const query = context.query.toLowerCase();
  if (query) {
    // Category names take precedence over same-named commands (for example
    // `.menu ai` lists AI commands, while `.help ai` documents the command).
    const category = groupedCommands(context).find(
      ([key]) => key === query || CATEGORY_LABELS[key]?.toLowerCase() === query,
    );
    if (category) {
      await context.reply(`${menuHeader(context)}\n\n${categorySection(...category)}`);
      return;
    }

    const command = context.registry.find(query);
    if (!command) throw new Error("Unknown category or command. Use menu without an argument.");
    await context.reply([
      menuHeader(context),
      "",
      `*${context.prefix}${command.name}*`,
      command.description,
      command.usage ? `Usage: ${context.prefix}${command.usage}` : "",
      command.aliases.length ? `Aliases: ${command.aliases.join(", ")}` : "",
      `Category: ${CATEGORY_LABELS[command.category] || command.category}`,
      command.ownerOnly ? "Access: owner only" : "",
      command.adminOnly ? "Access: group admins" : "",
    ].filter(Boolean).join("\n"));
    return;
  }

  const sections = groupedCommands(context).map(([category, commands]) =>
    categorySection(category, commands),
  );
  const footer = [
    `💡 *New here?* Use *${context.prefix}menu <category>* or *${context.prefix}menu <command>* to learn what a command does.`,
    `🤖 *Want your own ${context.config.botName}?* Contact the original creator with *${context.prefix}owner*.`,
    `📞 https://wa.me/${context.config.owners[0]}`,
  ].join("\n");
  const chunks = [];
  let current = `${menuHeader(context)}\n\n`;
  for (const section of sections) {
    if (current.length + section.length > 48_000) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${section}\n\n`;
  }
  chunks.push(`${current}${footer}`.trim());
  for (const chunk of chunks) await context.reply(chunk);
}

export default [
  {
    name: "menu",
    aliases: ["commands", "list"],
    category: "general",
    description: "Show all commands or one command category.",
    usage: "menu [category|command]",
    execute: sendMenu,
  },
  {
    name: "help",
    aliases: ["cmd"],
    category: "general",
    description: "Show command instructions.",
    usage: "help [command]",
    async execute(context) {
      if (!context.args[0]) {
        await context.reply(`Use *${context.prefix}menu* for all commands, *${context.prefix}menu ai* for one category, or *${context.prefix}help sticker* for details.`);
        return;
      }
      const command = context.registry.find(context.args[0]);
      if (!command) throw new Error("That command does not exist.");
      await context.reply([
        `*${context.prefix}${command.name}*`,
        command.description,
        `Category: ${CATEGORY_LABELS[command.category] || command.category}`,
        command.usage ? `Usage: ${context.prefix}${command.usage}` : "",
        command.aliases.length ? `Aliases: ${command.aliases.join(", ")}` : "",
        command.ownerOnly ? "Access: owner only" : "",
        command.adminOnly ? "Access: group admins" : "",
      ].filter(Boolean).join("\n"));
    },
  },
  {
    name: "ping",
    aliases: ["speed"],
    category: "general",
    description: "Check whether the bot is responsive.",
    async execute(context) {
      const started = performance.now();
      const sent = await context.reply("🏓 Testing...");
      const latency = Math.max(0, Math.round(performance.now() - started));
      await context.socket.sendMessage(context.chat, { text: `🏓 *Pong!* ${latency} ms`, edit: sent.key }).catch(() => {});
    },
  },
  {
    name: "alive",
    aliases: ["online"],
    category: "general",
    description: "Show the bot's live status.",
    async execute(context) {
      await context.reply(`⚡ *${context.config.botName} is online*\n\n${context.config.description}\nUptime: ${formatDuration(process.uptime())}`);
    },
  },
  {
    name: "uptime",
    category: "general",
    description: "Show process uptime.",
    async execute(context) {
      await context.reply(`⏱️ Uptime: *${longUptime(process.uptime())}*`);
    },
  },
  {
    name: "owner",
    aliases: ["creator"],
    category: "general",
    description: "Show the bot owner's contact.",
    async execute(context) {
      const number = context.config.owners[0];
      await context.reply(`👑 *${context.config.ownerName}*\nhttps://wa.me/${number}`);
    },
  },
  {
    name: "repo",
    aliases: ["source"],
    category: "general",
    description: "Show the official source repository.",
    async execute(context) {
      await context.reply(`🔗 *Official repository*\n${context.config.repository}`);
    },
  },
  {
    name: "runtime",
    aliases: ["botinfo"],
    category: "general",
    description: "Show safe runtime information.",
    async execute(context) {
      const status = context.runtime.publicStatus();
      await context.reply([
        `*${context.config.botName}*`,
        `Status: ${status.status}`,
        `Node: ${process.version}`,
        `Memory: ${memoryText()}`,
        `Platform: ${process.platform}/${process.arch}`,
        `Database: ${status.database}`,
        `Version: ${context.config.version}`,
      ].join("\n"));
    },
  },
];

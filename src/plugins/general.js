import { formatDuration } from "../utils.js";

const CATEGORY_LABELS = {
  general: "GENERAL",
  owner: "OWNER CONTROL",
  group: "GROUP ADMIN",
  media: "MEDIA",
  download: "SEARCH & DOWNLOAD",
  utility: "UTILITY",
  fun: "FUN",
  ai: "ARTIFICIAL INTELLIGENCE",
};

function menuText(context) {
  const categories = new Map();
  for (const command of context.registry.list()) {
    if (command.hidden) continue;
    if (!categories.has(command.category)) categories.set(command.category, []);
    categories.get(command.category).push(command);
  }

  const lines = [
    "╭━━━〔 ⚡ *VENOM MD* ⚡ 〕━━━╮",
    `┃  Bot      : ${context.config.botName}`,
    `┃  Owner    : ${context.config.ownerName}`,
    `┃  Mode     : ${context.store.mode.toUpperCase()}`,
    `┃  Prefix   : ${context.prefix}`,
    `┃  Uptime   : ${formatDuration(process.uptime())}`,
    `┃  Commands : ${context.registry.list().length}`,
    "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    "",
  ];

  for (const [category, commands] of categories) {
    lines.push(`╭─「 ${CATEGORY_LABELS[category] || category.toUpperCase()} 」`);
    for (const command of commands) lines.push(`│ ◦ ${context.prefix}${command.name}`);
    lines.push("╰──────────────", "");
  }

  lines.push(
    `Type *${context.prefix}help command* for details.`,
    `© ${new Date().getFullYear()} ${context.config.ownerName}`,
  );
  return lines.join("\n");
}

export default [
  {
    name: "menu",
    aliases: ["commands", "list"],
    category: "general",
    description: "Show the complete command menu.",
    async execute(context) {
      await context.reply(menuText(context));
    },
  },
  {
    name: "help",
    aliases: ["cmd"],
    category: "general",
    description: "Show command instructions.",
    usage: "help [command]",
    async execute(context) {
      if (!context.args[0]) {
        await context.reply(`Use *${context.prefix}menu* to see every command.\nExample: *${context.prefix}help sticker*`);
        return;
      }
      const command = context.registry.find(context.args[0]);
      if (!command) throw new Error("That command does not exist.");
      await context.reply(
        [
          `*${context.prefix}${command.name}*`,
          command.description,
          `Category: ${command.category}`,
          command.usage ? `Usage: ${context.prefix}${command.usage}` : "",
          command.aliases.length ? `Aliases: ${command.aliases.join(", ")}` : "",
          command.ownerOnly ? "Access: owner only" : "",
          command.adminOnly ? "Access: group admins" : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
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
      await context.socket.sendMessage(context.chat, {
        text: `🏓 *Pong!* ${latency} ms`,
        edit: sent.key,
      }).catch(() => {});
    },
  },
  {
    name: "alive",
    aliases: ["online"],
    category: "general",
    description: "Show the bot's live status.",
    async execute(context) {
      await context.reply(
        `⚡ *${context.config.botName} is online*\n\n${context.config.description}\nUptime: ${formatDuration(process.uptime())}`,
      );
    },
  },
  {
    name: "uptime",
    category: "general",
    description: "Show process uptime.",
    async execute(context) {
      await context.reply(`⏱️ Uptime: *${formatDuration(process.uptime())}*`);
    },
  },
  {
    name: "owner",
    aliases: ["creator"],
    category: "general",
    description: "Show the bot owner's contact.",
    async execute(context) {
      const number = context.config.owners[0];
      await context.reply(
        `👑 *${context.config.ownerName}*\nhttps://wa.me/${number}`,
      );
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
      const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const status = context.runtime.publicStatus();
      await context.reply(
        [
          `*${context.config.botName}*`,
          `Status: ${status.status}`,
          `Node: ${process.version}`,
          `Memory: ${memory} MB`,
          `Platform: ${process.platform}/${process.arch}`,
          `Database: ${status.database}`,
        ].join("\n"),
      );
    },
  },
];

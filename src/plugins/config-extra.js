const FEATURE_COMMANDS = [
  ["alwaysonline", "alwaysOnline", ["presencealways"]],
  ["autotyping", "autoTyping", ["typingmode"]],
  ["cmdreact", "cmdReact", ["commandreact"]],
  ["readmsg", "readMsg", ["autoread"]],
  ["readstatus", "readStatus", ["autoreadstatus"]],
  ["rejectcall", "rejectCall", ["anticall"]],
  ["startupmsg", "startupMsg", []],
  ["likestatus", "likeStatus", []],
  ["vvcmd", "vvCmd", ["vvcommand"]],
  ["savestatusauto", "saveStatus", []],
  ["forcejoin", "forceJoin", []],
];

function booleanArgument(context) {
  const value = context.args[0]?.toLowerCase();
  if (!["on", "off"].includes(value)) {
    throw new Error(`Use ${context.prefix}${context.command.name} on or off.`);
  }
  return value === "on";
}

const featureCommands = FEATURE_COMMANDS.map(([name, feature, aliases]) => ({
  name,
  aliases,
  category: "config",
  description: `Turn ${name} on or off (owner only).`,
  usage: `${name} on|off`,
  ownerOnly: true,
  async execute(context) {
    const enabled = booleanArgument(context);
    await context.store.setFeature(feature, enabled);
    if (feature === "alwaysOnline") {
      await context.socket.sendPresenceUpdate(enabled ? "available" : "unavailable").catch(() => {});
    }
    await context.reply(`✅ ${name}: *${enabled ? "on" : "off"}*`);
  },
}));

export default [
  ...featureCommands,
  {
    name: "statusinfo",
    category: "config",
    description: "Show all safe runtime feature toggles.",
    async execute(context) {
      const features = context.store.features();
      await context.reply(`⚙️ *VENOM SETTINGS*\n${Object.entries(features).map(([name, enabled]) => `• ${name}: ${enabled ? "on" : "off"}`).join("\n")}\n• mode: ${context.store.mode}\n• prefix: ${context.store.prefix}`);
    },
  },
  {
    name: "allvar",
    category: "config",
    description: "List supported safe configurable variables.",
    ownerOnly: true,
    async execute(context) {
      await context.reply(`🔧 *SUPPORTED VARIABLES*\n${Object.keys(context.store.features()).join("\n")}\nmode\nprefix\n\nSecrets are intentionally never shown.`);
    },
  },
  {
    name: "getvar",
    category: "config",
    description: "Read a safe runtime variable.",
    usage: "getvar <name>",
    ownerOnly: true,
    async execute(context) {
      const name = context.args[0];
      if (name === "mode") return context.reply(`mode = ${context.store.mode}`);
      if (name === "prefix") return context.reply(`prefix = ${context.store.prefix}`);
      if (!(name in context.store.features())) throw new Error("Unknown or protected variable.");
      await context.reply(`${name} = ${context.store.feature(name) ? "on" : "off"}`);
    },
  },
  {
    name: "setvar",
    category: "config",
    description: "Set a supported boolean runtime variable.",
    usage: "setvar <name> on|off",
    ownerOnly: true,
    async execute(context) {
      const [name, value] = context.args;
      if (!(name in context.store.features()) || !["on", "off"].includes(value)) {
        throw new Error("Enter a supported feature name followed by on or off.");
      }
      await context.store.setFeature(name, value === "on");
      await context.reply(`✅ ${name} = ${value}`);
    },
  },
  {
    name: "delvar",
    category: "config",
    description: "Turn off a supported runtime feature.",
    usage: "delvar <feature>",
    ownerOnly: true,
    async execute(context) {
      const name = context.args[0];
      if (!(name in context.store.features())) throw new Error("Unknown or protected variable.");
      await context.store.setFeature(name, false);
      await context.reply(`✅ ${name} reset to off.`);
    },
  },
  {
    name: "getmods",
    category: "config",
    description: "Show configured bot-owner numbers.",
    async execute(context) {
      await context.reply(`👑 *BOT OWNERS*\n${context.config.owners.map((number) => `• +${number}`).join("\n")}`);
    },
  },
  {
    name: "getmongo",
    category: "config",
    description: "Show database connection status without exposing its URL.",
    ownerOnly: true,
    async execute(context) {
      await context.reply(`🗄️ Database: *${context.runtime.database.status}*\nThe private connection URL is never displayed in chat.`);
    },
  },
  {
    name: "roles",
    category: "config",
    description: "Show your current command role.",
    async execute(context) {
      await context.reply(`🎭 Your role: *${context.isOwner ? "owner" : context.isAdmin ? "group admin" : "user"}*`);
    },
  },
  {
    name: "rolehelp",
    category: "config",
    description: "Explain VENOM command permissions.",
    async execute(context) {
      await context.reply("🎭 *ROLES*\n• Owner: bot configuration and process controls\n• Group admin: moderation and group settings\n• User: public commands\n\nPermissions are checked for every command.");
    },
  },
];

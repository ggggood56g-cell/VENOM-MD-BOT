import { jidNumber } from "../utils.js";

function requireTarget(context) {
  const target = context.targetJid();
  if (!target) throw new Error("Mention a user or reply to them.");
  return target;
}

export default [
  {
    name: "setmod",
    category: "bot",
    description: "Promote a user to bot moderator (owner only).",
    usage: "setmod @user",
    ownerOnly: true,
    async execute(context) {
      const target = requireTarget(context);
      const state = await context.store.setMod(target, true);
      await context.reply(`✅ @${jidNumber(target)} is ${state ? "now a moderator" : "unchanged"}.`, {
        mentions: [target],
      });
    },
  },
  {
    name: "delmod",
    category: "bot",
    description: "Remove a bot moderator (owner only).",
    usage: "delmod @user",
    ownerOnly: true,
    async execute(context) {
      const target = requireTarget(context);
      const state = await context.store.setMod(target, false);
      await context.reply(`✅ @${jidNumber(target)} mod access: ${state ? "on" : "off"}.`, {
        mentions: [target],
      });
    },
  },
  {
    name: "mods",
    category: "bot",
    description: "List bot moderators and sudo users.",
    async execute(context) {
      const mods = context.store.mods();
      await context.reply(
        `🛡️ *MODERATORS*\n${mods.length ? mods.map((jid) => `• @${jidNumber(jid)}`).join("\n") : "None set yet."}`,
        { mentions: mods },
      );
    },
  },
  {
    name: "setsudo",
    category: "bot",
    description: "Give a user sudo (moderator) access (owner only).",
    usage: "setsudo @user",
    ownerOnly: true,
    execute: (context) => context.registry.find("setmod").execute(context),
  },
  {
    name: "delsudo",
    category: "bot",
    description: "Remove sudo access (owner only).",
    usage: "delsudo @user",
    ownerOnly: true,
    execute: (context) => context.registry.find("delmod").execute(context),
  },
  {
    name: "getsudo",
    category: "bot",
    description: "List sudo users.",
    execute: (context) => context.registry.find("mods").execute(context),
  },
  {
    name: "setkey",
    category: "ai",
    description: "Attach an AI provider key at runtime (owner only).",
    usage: "setkey gemini <api key>",
    ownerOnly: true,
    async execute(context) {
      const provider = context.args[0]?.toLowerCase();
      const key = context.args.slice(1).join("").replace(/\s/g, "");
      if (!provider) throw new Error(`Providers: ${context.ai.supportedProviders().join(", ")}`);
      const added = context.ai.setKey(provider, key);
      await context.store.setRuntimeVar(`ai:${provider}`, added ? key : "");
      await context.reply(added
        ? `✅ ${provider} key saved. AI commands using ${provider} are live.`
        : `✅ ${provider} key removed.`);
    },
  },
  {
    name: "delkey",
    category: "ai",
    description: "Remove a runtime AI provider key (owner only).",
    usage: "delkey <provider>",
    ownerOnly: true,
    async execute(context) {
      const provider = context.args[0]?.toLowerCase();
      if (!provider) throw new Error(`Providers: ${context.ai.supportedProviders().join(", ")}`);
      context.ai.setKey(provider, "");
      await context.store.deleteRuntimeVar(`ai:${provider}`);
      await context.reply(`✅ ${provider} key removed.`);
    },
  },
  {
    name: "setmongo",
    category: "config",
    description: "Store a MongoDB connection string for backups (owner only).",
    usage: "setmongo <connection string>",
    ownerOnly: true,
    async execute(context) {
      if (!context.query.startsWith("mongodb")) throw new Error("Send a mongodb:// or mongodb+srv:// string.");
      await context.store.setRuntimeVar("mongoUri", context.query.slice(0, 500));
      await context.reply("✅ MongoDB URI stored. Set the MONGODB_URI env variable and restart to activate it.");
    },
  },
  {
    name: "delmongo",
    category: "config",
    description: "Remove the stored MongoDB URI (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.store.deleteRuntimeVar("mongoUri");
      await context.reply("✅ Stored MongoDB URI removed.");
    },
  },
  {
    name: "setrole",
    category: "user",
    description: "Give a member a custom role (admins only).",
    usage: "setrole @user <role name>",
    adminOnly: false,
    async execute(context) {
      const target = context.targetJid();
      const role = context.args.slice(context.args[0]?.startsWith("@") || /^\d{7,}$/.test(context.args[0] || "") ? 1 : 0)
        .join(" ").trim();
      if (!target || !role) throw new Error(`Use: ${context.prefix}setrole @user <role name>`);
      const saved = await context.store.setRole(target, role);
      await context.reply(`🏷️ @${jidNumber(target)} is now *${saved}*.`, { mentions: [target] });
    },
  },
  {
    name: "delrole",
    category: "user",
    description: "Remove a member's custom role (admins only).",
    usage: "delrole @user",
    async execute(context) {
      const target = requireTarget(context);
      await context.store.deleteRole(target);
      await context.reply(`🏷️ Role removed for @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "myrole",
    category: "user",
    description: "Show your current custom role.",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      const role = context.store.role(target);
      await context.reply(`🏷️ @${jidNumber(target)} — *${role}*`, { mentions: [target] });
    },
  },
];

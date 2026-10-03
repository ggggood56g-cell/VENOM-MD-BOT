export default [
  {
    name: "mode",
    aliases: ["setmode"],
    category: "owner",
    description: "Switch between public and private command access.",
    usage: "mode public|private",
    ownerOnly: true,
    async execute(context) {
      const mode = context.args[0]?.toLowerCase();
      if (!["public", "private"].includes(mode)) {
        throw new Error(`Use ${context.prefix}mode public or ${context.prefix}mode private.`);
      }
      await context.store.setGlobal({ mode });
      await context.reply(`✅ Command mode changed to *${mode}*.`);
    },
  },
  {
    name: "prefix",
    aliases: ["setprefix"],
    category: "owner",
    description: "Change the command prefix.",
    usage: "prefix <1-4 characters>",
    ownerOnly: true,
    async execute(context) {
      const prefix = context.args[0];
      if (!/^\S{1,4}$/u.test(prefix || "")) {
        throw new Error("The prefix must be 1–4 characters without spaces.");
      }
      await context.store.setGlobal({ prefix });
      await context.reply(`✅ Prefix changed to *${prefix}*.`);
    },
  },
  {
    name: "setname",
    category: "owner",
    description: "Change the connected WhatsApp profile name.",
    usage: "setname <name>",
    ownerOnly: true,
    async execute(context) {
      if (!context.query || context.query.length > 40) throw new Error("Enter a profile name up to 40 characters.");
      await context.socket.updateProfileName(context.query);
      await context.reply("✅ Profile name updated.");
    },
  },
  {
    name: "setbio",
    category: "owner",
    description: "Change the connected WhatsApp profile bio.",
    usage: "setbio <text>",
    ownerOnly: true,
    async execute(context) {
      if (!context.query || context.query.length > 139) throw new Error("Enter a bio up to 139 characters.");
      await context.socket.updateProfileStatus(context.query);
      await context.reply("✅ Profile bio updated.");
    },
  },
  {
    name: "block",
    category: "owner",
    description: "Block a mentioned, quoted or numbered user.",
    usage: "block @user",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention, quote or enter a phone number.");
      await context.socket.updateBlockStatus(target, "block");
      await context.reply("✅ User blocked.");
    },
  },
  {
    name: "unblock",
    category: "owner",
    description: "Unblock a mentioned, quoted or numbered user.",
    usage: "unblock <number>",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention, quote or enter a phone number.");
      await context.socket.updateBlockStatus(target, "unblock");
      await context.reply("✅ User unblocked.");
    },
  },
  {
    name: "restart",
    ownerStrict: true,
    category: "owner",
    description: "Gracefully restart the bot process.",
    ownerOnly: true,
    async execute(context) {
      await context.reply("♻️ Restarting safely...");
      setTimeout(() => context.registry.requestRestart(), 500).unref?.();
    },
  },
];

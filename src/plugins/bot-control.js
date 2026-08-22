import fs from "node:fs";
import path from "node:path";

import { formatDuration, jidNumber } from "../utils.js";

export default [
  {
    name: "bot",
    category: "bot",
    description: "Show VENOM bot identity and operating status.",
    async execute(context) {
      const status = context.runtime.publicStatus();
      await context.reply([
        `⚡ *${context.config.botName}*`,
        context.config.description,
        `Creator: ${context.config.ownerName}`,
        `Version: ${context.config.version}`,
        `Status: ${status.status}`,
        `Commands: ${context.registry.list().length}`,
        context.config.repository,
      ].join("\n"));
    },
  },
  {
    name: "stats",
    category: "bot",
    description: "Show process and command statistics.",
    async execute(context) {
      const memory = process.memoryUsage();
      await context.reply([
        "📊 *VENOM STATISTICS*",
        `Commands: ${context.registry.list().length}`,
        `Uptime: ${formatDuration(process.uptime())}`,
        `RSS memory: ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
        `Heap used: ${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        `Mode: ${context.store.mode}`,
        `Database: ${context.runtime.publicStatus().database}`,
      ].join("\n"));
    },
  },
  {
    name: "p-status",
    category: "process",
    description: "Show the current process status.",
    async execute(context) {
      await context.reply(`🟢 Process ${process.pid} is running\nNode: ${process.version}\nUptime: ${formatDuration(process.uptime())}`);
    },
  },
  {
    name: "shutdown",
    category: "process",
    description: "Gracefully stop the bot process (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.reply("🛑 Shutting down safely...");
      setTimeout(() => context.registry.requestShutdown(), 500).unref?.();
    },
  },
  {
    name: "backup",
    category: "bot",
    description: "Push current settings and session to MongoDB (owner only).",
    ownerOnly: true,
    async execute(context) {
      if (!context.runtime.database.collection("auth_sessions")) {
        throw new Error("MongoDB is not configured; local files are already current.");
      }
      await context.store.save();
      await context.runtime.authStore.backupNow();
      await context.reply("✅ Settings and session backup completed.");
    },
  },
  {
    name: "dbsize",
    category: "bot",
    description: "Show local state-file size (owner only).",
    ownerOnly: true,
    async execute(context) {
      const file = path.join(context.config.root, "data", "state.json");
      const stat = await fs.promises.stat(file);
      await context.reply(`🗄️ Local state size: ${(stat.size / 1024).toFixed(2)} KB`);
    },
  },
  {
    name: "grouplist",
    category: "bot",
    description: "List groups joined by the bot (owner only).",
    ownerOnly: true,
    async execute(context) {
      const groups = Object.values(await context.socket.groupFetchAllParticipating());
      await context.reply(`👥 *JOINED GROUPS (${groups.length})*\n\n${groups.slice(0, 100).map((group, index) => `${index + 1}. ${group.subject}\n${group.id}`).join("\n\n")}`);
    },
  },
  {
    name: "ban",
    aliases: ["mute-user", "ignore"],
    category: "bot",
    description: "Prevent a user from running bot commands (owner only).",
    usage: "ban @user",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention, quote or enter a user number.");
      await context.store.setBanned(target, true);
      await context.reply(`✅ @${jidNumber(target)} can no longer use commands.`, { mentions: [target] });
    },
  },
  {
    name: "unban",
    aliases: ["allow", "unmute-user"],
    category: "bot",
    description: "Restore a user's command access (owner only).",
    usage: "unban @user",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention, quote or enter a user number.");
      await context.store.setBanned(target, false);
      await context.reply(`✅ Command access restored for @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "banlist",
    category: "bot",
    description: "Show users blocked from bot commands (owner only).",
    ownerOnly: true,
    async execute(context) {
      const users = context.store.bannedUsers();
      await context.reply(`🚫 *BOT BAN LIST*\n${users.map((jid) => `• @${jidNumber(jid)}`).join("\n") || "Empty"}`, { mentions: users });
    },
  },
  {
    name: "update",
    category: "bot",
    description: "Show safe update instructions without downloading remote code.",
    ownerOnly: true,
    async execute(context) {
      await context.reply(`⬆️ Update safely through GitHub and your deployment provider.\n${context.config.repository}\n\nVENOM never downloads and executes remote updates from chat.`);
    },
  },
];

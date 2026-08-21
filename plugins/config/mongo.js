import config from "../../src/config.js";
import { backend, currentUri, isMongo } from "../../src/lib/database.js";
import { maskMongoUri } from "../../src/lib/mongoStore.js";

const environmentNotice = (prefix) =>
  `🔒 Database credentials cannot be submitted or changed through WhatsApp. Set *MONGODB* (or *MONGO_URI*) and optional *MONGO_DB* in your private deployment environment, then restart VENOM. Check the active backend with *${prefix}getmongo*.`;

/**
 * Database diagnostics with credential changes deliberately restricted to the
 * private deployment environment.
 */
export default [
  {
    name: "setmongo",
    alias: ["setmongouri", "setdb", "setdatabase"],
    category: "CONFIG",
    desc: "Explain how to configure MongoDB safely",
    usage: ".setmongo",
    owner: true,
    async run({ sock, m, args, prefix }) {
      // Delete accidental chat-delivered credentials without inspecting them.
      if (args.length > 0) {
        await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        return m.send(
          `🧹 That message was deleted because it may contain a credential.\n\n${environmentNotice(prefix)}`,
        );
      }
      await m.reply(environmentNotice(prefix));
    },
  },
  {
    name: "getmongo",
    alias: ["mongo", "dbinfo", "getdb"],
    category: "CONFIG",
    desc: "Show the active database backend without exposing credentials",
    usage: ".getmongo",
    owner: true,
    async run({ m }) {
      const active = currentUri();
      await m.reply(
        `╭━━━〔 *DATABASE* 〕━━━╮\n` +
          `┃ 🗄️ Backend: *${backend()}*\n` +
          `┃ 📛 Database: *${config.mongoDb}*\n` +
          `┃ 🔗 ${maskMongoUri(active)}\n` +
          `┃ 📍 Source: ${active ? "private deployment environment" : "local JSON compatibility storage"}\n` +
          `┃ 🔒 Namespace: *${config.botId}*\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n` +
          (isMongo()
            ? "_Database-backed command data survives restarts._"
            : "⚠️ _Local JSON data may not survive a host redeploy. Configure MONGODB privately in your deployment environment._"),
      );
    },
  },
  {
    name: "delmongo",
    alias: ["resetmongo", "unsetmongo"],
    category: "CONFIG",
    desc: "Explain how to remove MongoDB safely",
    usage: ".delmongo",
    owner: true,
    async run({ m, prefix }) {
      await m.reply(
        `🔒 VENOM will not rewrite database credentials from chat. Remove *MONGODB* and *MONGO_URI* from your private deployment environment, then restart.\n\nUse *${prefix}getmongo* after restart to verify the backend.`,
      );
    },
  },
];

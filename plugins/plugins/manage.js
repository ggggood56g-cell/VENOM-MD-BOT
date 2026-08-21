import {
  loadPlugins,
  categories,
  pluginCount,
} from "../../src/lib/pluginLoader.js";

const localOnlyNotice =
  "🔒 Remote plugin installation and chat-based file deletion are disabled. Add reviewed plugin files to the repository, deploy them, then use .reload.";

/**
 * Runtime visibility/reload commands.
 *
 * Historical versions downloaded and executed arbitrary JavaScript from chat.
 * VENOM keeps the familiar command names but requires repository-reviewed code.
 */
export default [
  {
    name: "plugin",
    alias: ["install", "addplugin"],
    category: "PLUGINS",
    desc: "Explain VENOM's safe, repository-based plugin installation flow",
    usage: ".plugin",
    owner: true,
    async run({ m }) {
      await m.reply(localOnlyNotice);
    },
  },
  {
    name: "delplugin",
    alias: ["uninstall", "rmplugin"],
    category: "PLUGINS",
    desc: "Explain VENOM's safe, repository-based plugin removal flow",
    usage: ".delplugin",
    owner: true,
    async run({ m }) {
      await m.reply(localOnlyNotice);
    },
  },
  {
    name: "plugins",
    alias: ["listplugins"],
    category: "PLUGINS",
    desc: "List every loaded command by category",
    usage: ".plugins",
    owner: true,
    async run({ m }) {
      let out = `🔌 *${pluginCount()} commands loaded*\n`;
      for (const [category, list] of categories) {
        out += `\n*${category}* (${list.length})\n${list
          .map((plugin) => `  • ${plugin.name}`)
          .join("\n")}\n`;
      }
      await m.reply(out);
    },
  },
  {
    name: "reload",
    alias: ["rl", "refresh"],
    category: "PLUGINS",
    desc: "Hot-reload reviewed local command files without restarting",
    usage: ".reload",
    owner: true,
    async run({ m }) {
      const before = pluginCount();
      await loadPlugins();
      await m.reply(
        `♻️ Reloaded reviewed local commands.\nBefore: ${before}\nAfter: ${pluginCount()}`,
      );
    },
  },
];

export default [
  {
    name: "plugins",
    category: "plugins",
    description: "Show installed plugin and routable-command totals.",
    async execute(context) {
      const categories = {};
      for (const command of context.registry.routableList()) {
        categories[command.category] = (categories[command.category] || 0) + 1;
      }
      await context.reply(`🧩 *VENOM PLUGINS*\nPlugin objects: ${context.registry.list().length}\nRoutable commands: ${context.registry.routableCount()}\n\n${Object.entries(categories).map(([name, count]) => `• ${name}: ${count}`).join("\n")}`);
    },
  },
  {
    name: "plugin",
    category: "plugins",
    description: "Inspect one installed or custom command.",
    usage: "plugin <command>",
    async execute(context) {
      const name = context.args[0]?.toLowerCase();
      const command = context.registry.find(name);
      if (command) {
        await context.reply(`🧩 *${name}*\nCanonical: ${command.name}\nCategory: ${command.category}\n${command.description}`);
        return;
      }
      const custom = context.store.customCommand(name);
      if (!custom) throw new Error("Plugin or custom command not found.");
      await context.reply(`🧩 *${name}*\nType: safe text-response plugin\nResponse length: ${custom.length}`);
    },
  },
  {
    name: "delplugin",
    category: "plugins",
    description: "Delete a custom text plugin; built-ins are protected (owner only).",
    usage: "delplugin <name>",
    ownerOnly: true,
    async execute(context) {
      if (context.registry.find(context.args[0])) throw new Error("Built-in plugins cannot be deleted from chat.");
      if (!(await context.store.deleteCustomCommand(context.args[0]))) throw new Error("Custom plugin not found.");
      await context.reply("✅ Custom plugin deleted.");
    },
  },
  {
    name: "reload",
    category: "plugins",
    description: "Restart safely to reload the installed source plugins (owner only).",
    ownerOnly: true,
    async execute(context) {
      await context.reply("♻️ Reloading installed plugins...");
      setTimeout(() => context.registry.requestRestart(), 500).unref?.();
    },
  },
];

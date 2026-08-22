function parseFilter(context) {
  const [trigger, ...parts] = context.query.split("|").map((value) => value.trim());
  const response = parts.join(" | ");
  if (!trigger || !response) {
    throw new Error(`Use: ${context.prefix}${context.command.name} trigger | response`);
  }
  return { trigger, response };
}

export default [
  {
    name: "pfilter",
    category: "autoreply",
    description: "Create a private-chat exact-match auto reply (owner only).",
    usage: "pfilter hello | Hi there!",
    ownerOnly: true,
    async execute(context) {
      const { trigger, response } = parseFilter(context);
      await context.store.setFilter("private", "", trigger, response);
      await context.reply(`✅ Private filter saved for “${trigger}”.`);
    },
  },
  {
    name: "gfilter",
    category: "autoreply",
    description: "Create an exact-match auto reply for this group.",
    usage: "gfilter rules | Please read the group description.",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const { trigger, response } = parseFilter(context);
      await context.store.setFilter("group", context.chat, trigger, response);
      await context.reply(`✅ Group filter saved for “${trigger}”.`);
    },
  },
  {
    name: "listfilters",
    category: "autoreply",
    description: "List auto-reply filters available in this chat.",
    async execute(context) {
      const scope = context.details.isGroup ? "group" : "private";
      const filters = context.store.filters(scope, context.chat);
      await context.reply(`🤖 *${scope.toUpperCase()} FILTERS*\n${Object.keys(filters).map((trigger) => `• ${trigger}`).join("\n") || "None"}`);
    },
  },
  {
    name: "pstop",
    category: "autoreply",
    description: "Delete a private-chat filter (owner only).",
    usage: "pstop <trigger>",
    ownerOnly: true,
    async execute(context) {
      if (!(await context.store.deleteFilter("private", "", context.query))) throw new Error("Filter not found.");
      await context.reply("✅ Private filter deleted.");
    },
  },
  {
    name: "gstop",
    category: "autoreply",
    description: "Delete a group filter.",
    usage: "gstop <trigger>",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      if (!(await context.store.deleteFilter("group", context.chat, context.query))) throw new Error("Filter not found.");
      await context.reply("✅ Group filter deleted.");
    },
  },
];

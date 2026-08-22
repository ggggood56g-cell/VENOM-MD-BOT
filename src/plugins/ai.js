export default [
  {
    name: "ai",
    aliases: ["gemini", "askai"],
    category: "ai",
    description: "Ask VENOM's AI assistant a question.",
    usage: "ai <question>",
    async execute(context) {
      if (!context.query) throw new Error("Ask a question after the command.");
      await context.reply("🧠 Thinking...");
      const answer = await context.ai.ask(context.query);
      await context.reply(`🧠 *VENOM AI*\n\n${answer}`);
    },
  },
];

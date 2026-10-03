const PROVIDERS = [
  ["gemini", "gemini"],
  ["gpt", "openai"],
  ["deepseek", "deepseek"],
  ["groq", "groq"],
  ["mistral", "mistral"],
  ["openrouter", "openrouter"],
  ["cerebras", "cerebras"],
  ["cohere", "cohere"],
];

const taskCommand = (name, description, system) => ({
  name,
  category: "ai",
  description,
  usage: `${name} <text>`,
  async execute(context) {
    if (!context.query) throw new Error("Add text or a question after the command.");
    await context.reply("🧠 Thinking...");
    const answer = await context.ai.ask(context.query, { system });
    await context.reply(`🧠 *VENOM ${name.toUpperCase()}*\n\n${answer}`);
  },
});

export default [
  {
    name: "ai",
    aliases: ["askai"],
    category: "ai",
    description: "Ask the first configured AI provider.",
    usage: "ai <question>",
    async execute(context) {
      if (!context.query) throw new Error("Ask a question after the command.");
      await context.reply("🧠 Thinking...");
      const answer = await context.ai.ask(context.query);
      await context.reply(`🧠 *VENOM AI*\n\n${answer}`);
    },
  },
  {
    name: "aistatus",
    aliases: ["aikeys"],
    category: "ai",
    description: "Show configured AI providers without exposing keys.",
    async execute(context) {
      const providers = context.ai.configuredProviders();
      await context.reply(
        providers.length
          ? `✅ *Configured AI providers*\n${providers.map((name) => `• ${name}`).join("\n")}`
          : "⚠️ No AI provider is configured. Add a private API-key environment variable.",
      );
    },
  },
  ...PROVIDERS.map(([name, provider]) => ({
    name,
    category: "ai",
    description: `Ask the configured ${name} provider.`,
    usage: `${name} <question>`,
    async execute(context) {
      if (!context.query) throw new Error("Ask a question after the command.");
      await context.reply(`🧠 Asking ${name}...`);
      const answer = await context.ai.ask(context.query, { provider });
      await context.reply(`🧠 *${name.toUpperCase()}*\n\n${answer}`);
    },
  })),
  taskCommand(
    "chatbot",
    "Have a friendly conversation with VENOM AI.",
    "You are VENOM's friendly chat assistant. Be conversational, helpful and concise.",
  ),
  taskCommand(
    "coder",
    "Get programming help and code explanations.",
    "You are a senior software engineer. Give secure, correct code with concise explanations and state assumptions.",
  ),
  taskCommand(
    "grammar",
    "Correct grammar while preserving the writer's meaning.",
    "Correct the user's grammar and clarity. Return the corrected text first, then briefly explain important changes.",
  ),
  taskCommand(
    "reasoning",
    "Work through a difficult question carefully.",
    "Solve the problem carefully. Give a concise conclusion and a useful explanation without exposing hidden chain-of-thought.",
  ),
  taskCommand(
    "summarize",
    "Summarize long text into clear points.",
    "Summarize the supplied content accurately using a short overview and key bullet points. Do not invent details.",
  ),
  taskCommand(
    "aisearch",
    "Ask AI for a structured research overview.",
    "Create a structured research overview. Clearly distinguish established facts, uncertainty, and details that may require current web verification.",
  ),
  taskCommand(
    "bidara",
    "Chat with BIDARA, the step-by-step research assistant persona.",
    "You are BIDARA (Bio-Integrated Data Analysis & Research Assistant), a meticulous step-by-step research assistant. Think through problems one step at a, cite what is established knowledge versus uncertainty, and finish with a concise practical conclusion. Stay safe, scientific and helpful.",
  ),
];

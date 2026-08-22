import { GoogleGenAI } from "@google/genai";

const DEFAULT_SYSTEM = `You are the helpful assistant inside VENOM MD BOT. Be concise, accurate, friendly and safe. Never reveal private credentials or claim to control settings you cannot access.`;

const OPENAI_PROVIDERS = Object.freeze({
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  deepseek: {
    url: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama-3.3-70b",
  },
});

async function boundedJson(response, maximumBytes = 1024 * 1024) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximumBytes) throw new Error("AI provider returned an oversized response.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("AI provider returned an empty response.");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("AI provider returned an oversized response.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks, total).toString("utf8");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`AI provider returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      String(payload?.error?.message || payload?.message || `AI request failed (${response.status}).`)
        .slice(0, 300),
    );
  }
  return payload;
}

export default class AiService {
  constructor(keys = {}) {
    this.keys = { ...keys };
    this.gemini = keys.gemini ? new GoogleGenAI({ apiKey: keys.gemini }) : null;
  }

  configuredProviders() {
    return Object.entries(this.keys)
      .filter(([, key]) => Boolean(key))
      .map(([name]) => name);
  }

  get available() {
    return this.configuredProviders().length > 0;
  }

  preferredProvider() {
    return this.configuredProviders()[0] || "";
  }

  async ask(prompt, { provider = "auto", system = DEFAULT_SYSTEM } = {}) {
    const text = String(prompt || "").trim().slice(0, 6_000);
    if (!text) throw new Error("Ask a question after the command.");
    const selected = provider === "auto" ? this.preferredProvider() : provider;
    if (!selected || !this.keys[selected]) {
      throw new Error(
        `${selected || "AI"} is not configured. Add its API key as a private deployment variable.`,
      );
    }

    if (selected === "gemini") return this.askGemini(text, system);
    if (selected === "cohere") return this.askCohere(text, system);
    if (!OPENAI_PROVIDERS[selected]) throw new Error(`Unsupported AI provider: ${selected}.`);
    return this.askOpenAiCompatible(selected, text, system);
  }

  async askGemini(prompt, system) {
    const response = await this.gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: system,
        maxOutputTokens: 1_200,
        temperature: 0.55,
      },
    });
    const answer = String(response.text || "").trim();
    if (!answer) throw new Error("Gemini returned an empty response.");
    return answer.slice(0, 6_000);
  }

  async askOpenAiCompatible(provider, prompt, system) {
    const settings = OPENAI_PROVIDERS[provider];
    const response = await fetch(settings.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.keys[provider]}`,
        "content-type": "application/json",
        ...(provider === "openrouter"
          ? { "HTTP-Referer": "https://github.com/MykelGoal/VENOM-MD-BOT", "X-Title": "VENOM MD BOT" }
          : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.55,
        max_tokens: 1_200,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await boundedJson(response);
    const answer = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error(`${provider} returned an empty response.`);
    return answer.slice(0, 6_000);
  }

  async askCohere(prompt, system) {
    const response = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.keys.cohere}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "command-r-plus",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 1_200,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await boundedJson(response);
    const answer = String(payload?.message?.content?.[0]?.text || "").trim();
    if (!answer) throw new Error("Cohere returned an empty response.");
    return answer.slice(0, 6_000);
  }
}

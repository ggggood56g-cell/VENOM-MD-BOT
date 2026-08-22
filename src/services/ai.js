import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `You are the helpful assistant inside VENOM MD BOT. Be concise, accurate, friendly and safe. Never claim to control WhatsApp settings or reveal private credentials.`;

export default class AiService {
  constructor(apiKey) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  get available() {
    return Boolean(this.client);
  }

  async ask(prompt) {
    if (!this.client) {
      throw new Error("AI is not configured. The owner must add GEMINI_API_KEY.");
    }
    const text = String(prompt || "").trim().slice(0, 4_000);
    if (!text) throw new Error("Ask a question after the command.");

    const response = await this.client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 900,
        temperature: 0.6,
      },
    });
    const answer = String(response.text || "").trim();
    if (!answer) throw new Error("AI returned an empty response. Try again.");
    return answer.slice(0, 4_000);
  }
}

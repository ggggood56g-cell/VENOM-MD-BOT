import assert from "node:assert/strict";
import test from "node:test";

import AiService from "../src/services/ai.js";

test("AI provider status exposes names but never key values", () => {
  const service = new AiService({ gemini: "secret-one", groq: "secret-two", openai: "" });
  assert.deepEqual(service.configuredProviders(), ["gemini", "groq"]);
  assert.equal(service.preferredProvider(), "gemini");
  assert.doesNotMatch(JSON.stringify(service.configuredProviders()), /secret/);
});

test("AI requests fail clearly when a provider is not configured", async () => {
  const service = new AiService({});
  await assert.rejects(() => service.ask("Hello"), /not configured/);
  await assert.rejects(() => service.ask("Hello", { provider: "groq" }), /not configured/);
});

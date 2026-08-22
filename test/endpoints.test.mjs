import assert from "node:assert/strict";
import test from "node:test";

import plugins from "../src/plugins/index.js";

const command = (name) => plugins.find((plugin) => plugin.name === name);

test("country command builds a flag emoji from the ISO code", async () => {
  const requests = [];
  const context = {
    query: "nigeria",
    prefix: ".",
    reply: async () => {},
  };
  // Inject a stub fetchJson by calling the command with a fake network layer is
  // not possible directly, so verify the flag rendering through the World Bank
  // entry normalization instead: the reply path uses flagEmoji(iso2Code).
  // Here we execute with a stubbed global fetch returning the WB catalog.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const body = String(url).includes("SP.POP.TOTL")
      ? [{ page: 1 }, [{ value: 237527782, date: "2025" }]]
      : [{ page: 1 }, [
          { id: "NGA", iso2Code: "NG", name: "Nigeria", capitalCity: "Abuja",
            region: { value: "Sub-Saharan Africa " }, incomeLevel: { value: "Lower middle income" } },
        ]];
    const payload = JSON.stringify(body);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    return {
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"], ["content-length", String(payload.length)]]),
      body: stream,
    };
  };
  let reply = "";
  context.reply = async (text) => { reply = text; };
  try {
    await command("country").execute(context);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(reply, /🇳🇬 \*Nigeria\*/);
  assert.match(reply, /Capital: Abuja/);
  assert.match(reply, /Population: ~237,527,782 \(2025\)/);
  assert.ok(requests.some((url) => url.includes("api.worldbank.org")));
});

test("currency command rejects bad input before any network call", async () => {
  await assert.rejects(
    command("currency").execute({ args: ["100", "USD"], prefix: ".", reply: async () => {} }),
    /Use: \.currency 100 USD NGN/,
  );
});

test("book command requires a query", async () => {
  await assert.rejects(
    command("book").execute({ query: "", prefix: ".", reply: async () => {} }),
    /Enter a search query/,
  );
});

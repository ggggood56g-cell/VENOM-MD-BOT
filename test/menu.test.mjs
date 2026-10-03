import assert from "node:assert/strict";
import test from "node:test";

import plugins from "../src/plugins/index.js";

const menu = plugins.find((plugin) => plugin.name === "menu");

function registry() {
  const keys = new Map();
  for (const plugin of plugins) {
    keys.set(plugin.name, plugin);
    for (const alias of plugin.aliases || []) keys.set(alias, plugin);
  }
  return {
    list: () => plugins,
    find: (name) => keys.get(name),
    routableCount: () => keys.size,
    routableList: () => [...keys.entries()].map(([name, plugin]) => ({
      ...plugin,
      name,
      canonicalName: plugin.name,
    })),
  };
}

test("v2 menu reports real branding, user and plugin count", async () => {
  const replies = [];
  await menu.execute({
    query: "ai",
    prefix: ".",
    details: { pushName: "Test User" },
    config: {
      botName: "VENOM MD BOT",
      ownerName: "TAPRUSH EMP (Micheal)",
      owners: ["15551234567"],
      version: "v2.0.0",
      platform: "nodejs",
    },
    registry: registry(),
    reply: async (text) => replies.push(text),
  });
  assert.equal(replies.length, 1);
  assert.match(replies[0], /VENOM MD BOT/);
  assert.match(replies[0], /Creator: TAPRUSH EMP \(Micheal\)/);
  assert.match(replies[0], /Number: 15551234567/);
  assert.match(replies[0], /User: Test User/);
  assert.match(replies[0], /Plugins: 633/);
  assert.match(replies[0], /Version: v2\.0\.0/);
  assert.match(replies[0], /𝙰𝙸/);
});

test("full menu renders every real category within WhatsApp-safe chunks", async () => {
  const replies = [];
  await menu.execute({
    query: "",
    prefix: ".",
    details: { pushName: "USER" },
    config: {
      botName: "VENOM MD BOT",
      ownerName: "TAPRUSH EMP (Micheal)",
      owners: ["15551234567"],
      version: "v2.0.0",
      platform: "nodejs",
    },
    registry: registry(),
    reply: async (text) => replies.push(text),
  });
  assert.ok(replies.length >= 1);
  assert.ok(replies.every((text) => text.length < 50_000));
  const complete = replies.join("\n");
  assert.match(complete, /𝙰𝙽𝙸𝙼𝙴/);
  assert.match(complete, /𝙴𝙲𝙾𝙽𝙾𝙼𝚈/);
  assert.match(complete, /𝚃𝙴𝚇𝚃𝙼𝙰𝙺𝙴𝚁/);
  assert.match(complete, /https:\/\/wa\.me\/15551234567/);
});

test("menu command lookup shows contextual usage", async () => {
  let response = "";
  await menu.execute({
    query: "sticker",
    prefix: ".",
    details: { pushName: "USER" },
    config: {
      botName: "VENOM MD BOT",
      ownerName: "TAPRUSH EMP (Micheal)",
      owners: ["15551234567"],
      version: "v2.0.0",
      platform: "nodejs",
    },
    registry: registry(),
    reply: async (text) => { response = text; },
  });
  assert.match(response, /\.sticker/);
  assert.match(response, /Turn an image or short video into a sticker/);
});

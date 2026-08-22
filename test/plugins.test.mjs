import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import plugins from "../src/plugins/index.js";

test("the clean command catalogue is complete and collision-free", () => {
  assert.equal(plugins.length, 469);
  const keys = new Set();
  for (const plugin of plugins) {
    assert.match(plugin.name, /^[a-z0-9][a-z0-9-]{0,31}$/);
    assert.equal(typeof plugin.description, "string");
    assert.equal(typeof plugin.execute, "function");
    for (const key of [plugin.name, ...(plugin.aliases || [])]) {
      assert.equal(keys.has(key), false, `duplicate command key: ${key}`);
      keys.add(key);
    }
  }
  assert.equal(keys.size, 539);
});

test("the bot does not contain a built-in pairing endpoint or remote code loader", () => {
  const files = ["index.js", "src/bot.js", "src/server.js"];
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /requestPairingCode|\/api\/pair|\/api\/session/);
  assert.doesNotMatch(source, /downloadAndExtract|pathToFileURL\(|remote code/i);
});

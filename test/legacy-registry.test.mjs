import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  categories,
  commands,
  loadIssues,
  loadPlugins,
  middlewares,
  pluginCount,
} from "../src/lib/pluginLoader.js";
import { legacyCommandFor } from "../src/handler.js";

async function javascriptFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, `plugin symlink is forbidden: ${entry.name}`);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await javascriptFiles(target)));
    else if (entry.name.endsWith(".js")) output.push(target);
  }
  return output;
}

const legacyRootUrl = new URL("../plugins/", import.meta.url);
const legacyRoot = fileURLToPath(legacyRootUrl);
const atlasRoot = new URL("../Plugins/", import.meta.url);

await loadPlugins();

test("the complete restored VENOM catalogue loads with exact stable counts", async () => {
  const files = await javascriptFiles(legacyRoot);
  assert.equal(files.length, 82);
  assert.equal(pluginCount(), 552);
  assert.equal(commands.size, 1098);
  assert.equal(categories.size, 24);
  assert.equal(middlewares.length, 27);
  assert.deepEqual(loadIssues, []);

  const objects = [...categories.values()].flat();
  // 549 runnable command objects plus 3 hook-only watchers = 552 loaded objects.
  assert.equal(objects.length, 549);
  assert.equal(pluginCount() - objects.length, 3);
  assert.equal(new Set(objects).size, 549);
  assert.ok(objects.every((plugin) => typeof plugin.name === "string"));
  assert.ok(objects.every((plugin) => typeof plugin.run === "function"));
});

test("legacy command resolution includes aliases and preserves catalogue precedence", async () => {
  const atlasFiles = (await readdir(atlasRoot))
    .filter((file) => file.endsWith(".js"))
    .sort();
  const atlasAliases = new Set();
  for (const file of atlasFiles) {
    const plugin = (await import(new URL(file, atlasRoot))).default;
    for (const alias of plugin.alias || []) atlasAliases.add(String(alias).toLowerCase());
  }

  const overlap = [...atlasAliases].filter((key) => commands.has(key));
  const atlasOnly = [...atlasAliases].filter((key) => !commands.has(key));
  assert.equal(atlasFiles.length, 17);
  assert.equal(atlasAliases.size, 246);
  assert.equal(overlap.length, 129);
  assert.equal(atlasOnly.length, 117);

  const ping = legacyCommandFor(".ping");
  assert.equal(ping.command, "ping");
  assert.equal(ping.plugin, commands.get("ping"));
  assert.match(ping.plugin.file, /plugins[/\\]/);

  const atlasOnlyCommand = atlasOnly.find(Boolean);
  assert.ok(atlasOnlyCommand);
  assert.equal(legacyCommandFor(`.${atlasOnlyCommand}`), null);
});

test("safety-redesigned compatibility commands remain registered", () => {
  for (const name of [
    "restart",
    "shutdown",
    "update",
    "setkey",
    "delkey",
    "rbgkey",
    "predkey",
    "mongo",
    "plugin",
  ]) {
    assert.ok(commands.has(name), `${name} must remain in the restored catalogue`);
  }
});

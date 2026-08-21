import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

const pluginFiles = (await readdir(new URL("../Plugins/", import.meta.url)))
  .filter((file) => file.endsWith(".js"))
  .sort();

const plugins = await Promise.all(
  pluginFiles.map(async (file) => ({
    file,
    plugin: (await import(`../Plugins/${file}`)).default,
  })),
);

test("every plugin exposes a valid command manifest", () => {
  assert.ok(plugins.length > 0);
  for (const { file, plugin } of plugins) {
    assert.equal(typeof plugin, "object", `${file} must default-export an object`);
    assert.match(plugin.name, /^[a-zA-Z0-9_-]+$/, `${file} has an invalid name`);
    assert.equal(typeof plugin.start, "function", `${file} must expose start()`);
    assert.ok(Array.isArray(plugin.alias), `${file} must expose aliases`);
    assert.ok(plugin.alias.length > 0, `${file} must expose at least one alias`);
  }
});

test("command aliases are normalized and collision-free", () => {
  const owners = new Map();
  for (const { file, plugin } of plugins) {
    const aliasesInPlugin = new Set();
    for (const aliasValue of plugin.alias) {
      const alias = String(aliasValue);
      assert.equal(alias, alias.trim().toLowerCase(), `${file}: ${alias} is not normalized`);
      assert.match(alias, /^[a-z0-9_-]+$/, `${file}: ${alias} is not a safe alias`);
      assert.ok(!aliasesInPlugin.has(alias), `${file}: duplicate alias ${alias}`);
      aliasesInPlugin.add(alias);
      assert.ok(!owners.has(alias), `${file}: alias ${alias} also belongs to ${owners.get(alias)}`);
      owners.set(alias, file);
    }
  }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverPlugins } from "../src/plugin-loader.js";
import plugins, { pluginFiles, routableCount } from "../src/plugins/index.js";

test("production plugin directory is auto-discovered without a manual import registry", async () => {
  const diskFiles = [];
  async function walk(directory, root = directory) {
    for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target, root);
      else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name) && entry.name !== "index.js") {
        diskFiles.push(path.relative(root, target).split(path.sep).join("/"));
      }
    }
  }
  await walk(path.resolve("src/plugins"));
  assert.deepEqual([...pluginFiles], diskFiles.sort());
  assert.equal(plugins.length, 469);
  assert.equal(routableCount, 539);
  assert.ok(plugins.every((command) => pluginFiles.includes(command.sourceFile)));
});

test("new nested plugin files load automatically in deterministic order", async (context) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-plugins-"));
  context.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  await fs.promises.mkdir(path.join(root, "nested"));
  await fs.promises.writeFile(
    path.join(root, "b.mjs"),
    "export default [{name:'beta',aliases:['b'],category:'test',description:'Beta',execute(){}}]\n",
  );
  await fs.promises.writeFile(
    path.join(root, "nested", "a.mjs"),
    "export default {name:'alpha',category:'test',description:'Alpha',execute(){}}\n",
  );
  await fs.promises.writeFile(
    path.join(root, "_ignored.mjs"),
    "throw new Error('ignored files must never execute')\n",
  );

  const result = await discoverPlugins(root);
  assert.deepEqual([...result.files], ["b.mjs", "nested/a.mjs"]);
  assert.deepEqual(result.commands.map((command) => command.name), ["beta", "alpha"]);
  assert.equal(result.routableCount, 3);
});

test("auto-discovery fails closed on duplicate or malformed manifests", async (context) => {
  const duplicateRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-duplicate-"));
  const invalidRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-invalid-"));
  context.after(() => Promise.all([
    fs.promises.rm(duplicateRoot, { recursive: true, force: true }),
    fs.promises.rm(invalidRoot, { recursive: true, force: true }),
  ]));

  await fs.promises.writeFile(
    path.join(duplicateRoot, "one.mjs"),
    "export default {name:'same',category:'test',execute(){}}\n",
  );
  await fs.promises.writeFile(
    path.join(duplicateRoot, "two.mjs"),
    "export default {name:'other',aliases:['same'],category:'test',execute(){}}\n",
  );
  await fs.promises.writeFile(
    path.join(invalidRoot, "bad.mjs"),
    "export default {name:'Bad Name',category:'test'}\n",
  );

  await assert.rejects(() => discoverPlugins(duplicateRoot), /Duplicate command key/);
  await assert.rejects(() => discoverPlugins(invalidRoot), /invalid name/);
});

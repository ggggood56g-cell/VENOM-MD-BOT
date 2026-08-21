import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("VENOM does not expose a built-in QR or phone pairing service", () => {
  const source = read("index.js");
  assert.equal(fs.existsSync(path.join(root, "Frontend")), false);
  assert.doesNotMatch(source, /["']\/api\/qr["']/);
  assert.doesNotMatch(source, /["']\/api\/pair["']/);
  assert.doesNotMatch(source, /requestPairingCode\s*\(/);
  assert.doesNotMatch(source, /express\.static\s*\(/);
  assert.doesNotMatch(source, /SETUP_TOKEN/);
});

test("deployment metadata no longer requests a built-in setup secret", () => {
  assert.doesNotMatch(read(".env.example"), /^SETUP_TOKEN=/m);
  assert.equal(Object.hasOwn(JSON.parse(read("app.json")).env, "SETUP_TOKEN"), false);
});

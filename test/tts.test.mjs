import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLanguage } from "../src/services/tts.js";

test("tts language codes are normalized and validated", () => {
  assert.equal(normalizeLanguage("EN"), "en");
  assert.equal(normalizeLanguage("fr"), "fr");
  assert.equal(normalizeLanguage("PT-BR"), "pt-br");
  assert.throws(() => normalizeLanguage("english"), /valid language code/);
  assert.throws(() => normalizeLanguage("e1"), /valid language code/);
  assert.throws(() => normalizeLanguage(""), /valid language code/);
});

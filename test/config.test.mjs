import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBoolean,
  parseNamespace,
  parseNumberList,
  parsePrefixes,
} from "../src/config.js";

test("boolean configuration recognizes explicit enabled values", () => {
  assert.equal(parseBoolean("yes"), true);
  assert.equal(parseBoolean("OFF", true), false);
  assert.equal(parseBoolean(undefined, true), true);
});

test("owner numbers are normalized, validated and deduplicated", () => {
  assert.deepEqual(
    parseNumberList("+1 555 123 4567, 15551234567, bad, 123"),
    ["15551234567"],
  );
});

test("prefix and namespace parsing rejects unsafe values", () => {
  assert.deepEqual(parsePrefixes("., !, /, bad prefix"), [".", "!", "/"]);
  assert.equal(parseNamespace("venom_main"), "venom_main");
  assert.equal(parseNamespace("../escape"), "venom");
});

import assert from "node:assert/strict";
import test from "node:test";

import { calculate } from "../src/services/calculator.js";

test("calculator applies precedence and parentheses", () => {
  assert.equal(calculate("2 + 3 * 4"), 14);
  assert.equal(calculate("(2 + 3) * 4"), 20);
  assert.equal(calculate("2 ^ 3"), 8);
});

test("calculator rejects code and non-finite results", () => {
  assert.throws(() => calculate("process.exit()"), /Only numbers/);
  assert.throws(() => calculate("4 / 0"), /finite/);
  assert.throws(() => calculate("2 +"), /incomplete/);
});

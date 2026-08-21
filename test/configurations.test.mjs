import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredMongoUri,
  isLocalMongoUri,
  parseMongoUri,
  parsePhoneNumbers,
  resolveMongoUri,
  parsePrefix,
  parseProviderKeys,
  parseSessionId,
} from "../Configurations.js";

test("administrator phone parsing normalizes, validates, and deduplicates numbers", () => {
  assert.deepEqual(
    parsePhoneNumbers(
      "+234 802 101 6309, 234-802-101-6309, short, +1 (202) 555-0123",
    ),
    ["2348021016309", "12025550123"],
  );
  assert.deepEqual(parsePhoneNumbers("not-a-number,123"), []);
});

test("provider key parsing trims empty values and enforces limits", () => {
  assert.deepEqual(parseProviderKeys(" first-key, ,second-key "), [
    "first-key",
    "second-key",
  ]);
  assert.deepEqual(parseProviderKeys(`valid,${"x".repeat(513)}`), ["valid"]);
});

test("prefix, session, and Mongo configuration reject unsafe values", () => {
  assert.equal(parsePrefix(" ! "), "!");
  assert.equal(parsePrefix("contains spaces"), ".");
  assert.equal(parsePrefix("x".repeat(9)), ".");

  assert.equal(parseSessionId("venom_main-1"), "venom_main-1");
  assert.equal(parseSessionId("../session"), "venom");
  assert.equal(parseSessionId(""), "venom");

  assert.equal(
    parseMongoUri("mongodb+srv://example.invalid/venom"),
    "mongodb+srv://example.invalid/venom",
  );
  assert.equal(
    parseMongoUri("https://example.invalid/database"),
    "mongodb://127.0.0.1:27017/venom",
  );
});

test("Mongo URI resolution supports the alias and fails closed in production", () => {
  assert.equal(
    configuredMongoUri("not-a-uri", " mongodb+srv://cluster.example/venom "),
    "mongodb+srv://cluster.example/venom",
  );
  assert.equal(isLocalMongoUri("mongodb://127.0.0.1:27017/venom"), true);
  assert.equal(isLocalMongoUri("mongodb+srv://cluster.example/venom"), false);
  assert.equal(
    resolveMongoUri(["not-a-uri"], { production: true }),
    "",
  );
  assert.equal(
    resolveMongoUri(["mongodb://127.0.0.1:27017/venom"], { production: true }),
    "",
  );
  assert.equal(
    resolveMongoUri(["not-a-uri"], { production: false }),
    "mongodb://127.0.0.1:27017/venom",
  );
  assert.equal(
    resolveMongoUri(["", "mongodb://db.example/venom"], { production: true }),
    "mongodb://db.example/venom",
  );
});

test("public creator identity remains permanent when configuration loads", () => {
  assert.equal(global.botName, "VENOM MD BOT");
  assert.equal(global.creatorName, "TAPRUSH EMP (Micheal)");
  assert.equal(global.creatorNumber, "2348021016309");
});

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { BufferJSON, initAuthCreds } from "baileys";
import MongoAuth, {
  decodeSessionCredential,
  isSafeSessionFilename,
} from "../System/MongoAuth/MongoAuth.js";

test("Mongo auth confines validated session identifiers to the session directory", () => {
  const auth = new MongoAuth("venom_main-1");
  assert.equal(path.basename(auth.dir), "venom_main-1");
  assert.throws(() => new MongoAuth("../outside"), /SESSION_NAMESPACE/);
  assert.throws(() => new MongoAuth("contains/slash"), /SESSION_NAMESPACE/);
  assert.throws(() => new MongoAuth("x".repeat(65)), /SESSION_NAMESPACE/);
});

test("Mongo auth accepts Baileys key names but rejects traversal and controls", () => {
  assert.equal(isSafeSessionFilename("creds.json"), true);
  assert.equal(
    isSafeSessionFilename("session-2348021016309.0@s.whatsapp.net.json"),
    true,
  );
  assert.equal(isSafeSessionFilename("sender-key-abc+def==.json"), true);
  assert.equal(isSafeSessionFilename("../creds.json"), false);
  assert.equal(isSafeSessionFilename("nested/creds.json"), false);
  assert.equal(isSafeSessionFilename("bad\\creds.json"), false);
  assert.equal(isSafeSessionFilename("bad\u0000name.json"), false);
  assert.equal(isSafeSessionFilename("not-json.txt"), false);
});

test("external session credentials are bounded and validated before import", () => {
  const creds = initAuthCreds();
  creds.registered = true;
  creds.me = { id: "2348021016309@s.whatsapp.net", name: "VENOM" };
  const encoded = Buffer.from(
    JSON.stringify(creds, BufferJSON.replacer),
    "utf8",
  ).toString("base64");

  const decoded = JSON.parse(
    decodeSessionCredential(encoded),
    BufferJSON.reviver,
  );
  assert.equal(decoded.registered, true);
  assert.equal(decoded.me.id, "2348021016309@s.whatsapp.net");
  assert.equal(Buffer.isBuffer(decoded.noiseKey.private), true);

  const unlinked = initAuthCreds();
  const unlinkedEncoded = Buffer.from(
    JSON.stringify(unlinked, BufferJSON.replacer),
  ).toString("base64");
  assert.throws(
    () => decodeSessionCredential(unlinkedEncoded),
    /incomplete or not linked/,
  );
  assert.throws(() => decodeSessionCredential("not-base64"), /canonical base64/);
  assert.throws(
    () => decodeSessionCredential("A".repeat(2 * 1024 * 1024 + 4)),
    /2 MB safety limit/,
  );
});

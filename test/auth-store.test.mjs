import assert from "node:assert/strict";
import test from "node:test";

import { BufferJSON } from "baileys";

import { decodeSessionCredential } from "../src/auth-store.js";

const keyPair = () => ({ private: Buffer.alloc(32, 1), public: Buffer.alloc(32, 2) });

function validCredential() {
  const credentials = {
    noiseKey: keyPair(),
    pairingEphemeralKeyPair: keyPair(),
    signedIdentityKey: keyPair(),
    signedPreKey: {
      keyPair: keyPair(),
      signature: Buffer.alloc(64, 3),
      keyId: 1,
    },
    registrationId: 1234,
    advSecretKey: "a".repeat(32),
    me: { id: "2348021016309@s.whatsapp.net", name: "VENOM" },
    registered: true,
  };
  return Buffer.from(JSON.stringify(credentials, BufferJSON.replacer)).toString("base64");
}

test("session decoder accepts the pairing site's base64 creds format", () => {
  const result = decodeSessionCredential(validCredential());
  const parsed = JSON.parse(result, BufferJSON.reviver);
  assert.equal(parsed.registered, true);
  assert.equal(parsed.me.id, "2348021016309@s.whatsapp.net");
  assert.ok(Buffer.isBuffer(parsed.noiseKey.private));
});

test("session decoder rejects malformed and unlinked values", () => {
  assert.throws(() => decodeSessionCredential("not-base64"), /base64/);
  const unlinked = Buffer.from(JSON.stringify({ registered: false })).toString("base64");
  assert.throws(() => decodeSessionCredential(unlinked), /incomplete/);
  assert.equal(decodeSessionCredential(""), null);
});

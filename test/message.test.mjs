import assert from "node:assert/strict";
import test from "node:test";

import { messageDetails, messageText, unwrapMessage } from "../src/message.js";

test("message parser unwraps ephemeral text and captions", () => {
  const wrapped = {
    ephemeralMessage: {
      message: { imageMessage: { caption: ".sticker" } },
    },
  };
  assert.deepEqual(unwrapMessage(wrapped), { imageMessage: { caption: ".sticker" } });
  assert.equal(messageText({ message: wrapped }), ".sticker");
});

test("message details preserve mentions and quoted messages", () => {
  const raw = {
    key: { remoteJid: "12345@g.us", participant: "15551234567:2@s.whatsapp.net" },
    message: {
      extendedTextMessage: {
        text: ".ship @2348000000000",
        contextInfo: {
          mentionedJid: ["2348000000000@s.whatsapp.net"],
          stanzaId: "ABC",
          participant: "2348000000000@s.whatsapp.net",
          quotedMessage: { conversation: "hello" },
        },
      },
    },
  };
  const details = messageDetails(raw);
  assert.equal(details.isGroup, true);
  assert.equal(details.text, ".ship @2348000000000");
  assert.equal(details.mentionedJids[0], "2348000000000@s.whatsapp.net");
  assert.equal(details.quoted.key.id, "ABC");
});

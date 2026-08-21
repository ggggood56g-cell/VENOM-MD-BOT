import assert from "node:assert/strict";
import test from "node:test";
import { serialize } from "../System/whatsapp.js";

const groupJid = "120363000000000000@g.us";
const senderJid = "2348000000000@s.whatsapp.net";

function createConnection() {
  const calls = [];
  return {
    calls,
    user: { id: "2348021016309:7@s.whatsapp.net" },
    sendMessage: async (...args) => {
      calls.push(["sendMessage", ...args]);
      return { ok: true };
    },
    sendFile: async (...args) => {
      calls.push(["sendFile", ...args]);
      return { ok: true };
    },
    sendText: async (...args) => {
      calls.push(["sendText", ...args]);
      return { ok: true };
    },
    downloadMediaMessage: async () => Buffer.from("media"),
  };
}

function createQuotedGroupMessage() {
  return {
    key: {
      remoteJid: groupJid,
      participant: senderJid,
      fromMe: false,
      id: "MESSAGE-ID",
    },
    message: {
      extendedTextMessage: {
        text: ".test",
        contextInfo: {
          stanzaId: "BAE5123456789012",
          participant: "2348111111111@s.whatsapp.net",
          quotedMessage: {
            imageMessage: {
              caption: "quoted caption",
              mimetype: "image/jpeg",
              contextInfo: {
                mentionedJid: ["2348222222222@s.whatsapp.net"],
              },
            },
          },
        },
      },
    },
  };
}

test("quoted group messages use a Baileys v7 participant key", async () => {
  const connection = createConnection();
  const message = serialize(connection, createQuotedGroupMessage());

  assert.equal(message.from, groupJid);
  assert.equal(message.sender, senderJid);
  assert.equal(message.body, ".test");
  assert.equal(message.quoted.from, groupJid);
  assert.equal(message.quoted.sender, "2348111111111@s.whatsapp.net");
  assert.equal(message.quoted.text, "quoted caption");
  assert.deepEqual(message.quoted.mentions, ["2348222222222@s.whatsapp.net"]);
  assert.equal(message.quoted.isBot, true);
  assert.equal(message.quoted.fakeObj.key.remoteJid, groupJid);
  assert.equal(
    message.quoted.fakeObj.key.participant,
    "2348111111111@s.whatsapp.net",
  );
  assert.equal(message.quoted.fakeObj.participant, null);

  await message.quoted.delete();
  const deleteCall = connection.calls.at(-1);
  assert.equal(deleteCall[0], "sendMessage");
  assert.equal(deleteCall[1], groupJid);
  assert.equal(deleteCall[2].delete.participant, "2348111111111@s.whatsapp.net");
});

test("buffer replies use the current five-argument sendFile contract", async () => {
  const connection = createConnection();
  const message = serialize(connection, createQuotedGroupMessage());
  const buffer = Buffer.from("reply");
  const options = { fileName: "reply.bin", caption: "A file" };

  await message.reply(buffer, groupJid, options);
  const call = connection.calls.at(-1);
  assert.equal(call.length, 6);
  assert.equal(call[0], "sendFile");
  assert.equal(call[1], groupJid);
  assert.strictEqual(call[2], buffer);
  assert.equal(call[3], "reply.bin");
  assert.strictEqual(call[4], message);
  assert.strictEqual(call[5], options);
});

test("text replies quote the serialized message", async () => {
  const connection = createConnection();
  const message = serialize(connection, createQuotedGroupMessage());
  const options = { mentions: [senderJid] };

  await message.reply("hello", groupJid, options);
  assert.deepEqual(connection.calls.at(-1), [
    "sendText",
    groupJid,
    "hello",
    message,
    options,
  ]);
});

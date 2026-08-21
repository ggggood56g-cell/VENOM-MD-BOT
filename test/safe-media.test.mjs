import assert from "node:assert/strict";
import test from "node:test";

import {
  materializePublicMedia,
  protectSocketMedia,
} from "../System/SafeMedia.js";

test("remote Baileys media is downloaded before sendMessage receives it", async () => {
  const calls = [];
  const http = {
    async get(url, options) {
      calls.push({ url, options });
      return { data: Buffer.from("guarded-media") };
    },
  };
  const original = {
    image: { url: "https://cdn.example.com/photo.jpg" },
    caption: "VENOM",
  };
  const result = await materializePublicMedia(original, { http, maximumBytes: 1024 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://cdn.example.com/photo.jpg");
  assert.equal(calls[0].options.maxContentLength, 1024);
  assert.deepEqual(result.image, Buffer.from("guarded-media"));
  assert.equal(result.caption, "VENOM");
  assert.deepEqual(original.image, { url: "https://cdn.example.com/photo.jpg" });
});

test("local media paths, buffers, and ordinary messages pass through unchanged", async () => {
  const http = { get: async () => assert.fail("HTTP must not run") };
  const local = { image: { url: "Assets/Venom.jpg" } };
  const buffered = { video: Buffer.from("video") };
  const text = { text: "hello" };

  assert.equal(await materializePublicMedia(local, { http }), local);
  assert.equal(await materializePublicMedia(buffered, { http }), buffered);
  assert.equal(await materializePublicMedia(text, { http }), text);
});

test("socket protection applies guarded media resolution to every send", async () => {
  const sent = [];
  const socket = {
    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options });
      return { key: { id: "sent-1" } };
    },
  };
  const http = {
    async get() {
      return { data: Buffer.from("audio") };
    },
  };
  protectSocketMedia(socket, { http, maximumBytes: 1024 });

  const response = await socket.sendMessage(
    "2348021016309@s.whatsapp.net",
    { audio: { url: "https://cdn.example.com/song.mp3" }, mimetype: "audio/mpeg" },
    { quoted: { key: { id: "quoted" } } },
  );

  assert.equal(response.key.id, "sent-1");
  assert.deepEqual(sent[0].content.audio, Buffer.from("audio"));
  assert.equal(sent[0].content.mimetype, "audio/mpeg");
  assert.equal(sent[0].options.quoted.key.id, "quoted");
});

test("empty and oversized remote media fail closed", async () => {
  await assert.rejects(
    materializePublicMedia(
      { image: { url: "https://cdn.example.com/empty.jpg" } },
      { http: { get: async () => ({ data: Buffer.alloc(0) }) }, maximumBytes: 10 },
    ),
    /empty/i,
  );
  await assert.rejects(
    materializePublicMedia(
      { image: { url: "https://cdn.example.com/large.jpg" } },
      { http: { get: async () => ({ data: Buffer.alloc(11) }) }, maximumBytes: 10 },
    ),
    /size limit/i,
  );
});

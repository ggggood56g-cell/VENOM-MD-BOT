import assert from "node:assert/strict";
import test from "node:test";

import plugins, {
  buildRevealMessage,
  innerMessage,
  isViewOnce,
} from "../src/plugins/viewonce.js";

const command = (name) => plugins.find((plugin) => plugin.name === name);

test("view once helpers detect wrappers and unwrap inner content", () => {
  const viewOnceImage = {
    viewOnceMessageV2: {
      message: { imageMessage: { caption: "secret photo", url: "https://example.com/a" } },
    },
  };
  const nested = {
    ephemeralMessage: {
      message: {
        viewOnceMessageV2Extension: {
          message: { audioMessage: { ptt: true, url: "https://example.com/b" } },
        },
      },
    },
  };
  const plainImage = { imageMessage: { caption: "normal", url: "https://example.com/c" } };

  assert.equal(isViewOnce(viewOnceImage), true);
  assert.equal(isViewOnce(nested), true);
  assert.equal(isViewOnce(plainImage), false);

  assert.equal(innerMessage(viewOnceImage).imageMessage.caption, "secret photo");
  assert.equal(innerMessage(plainImage).imageMessage.caption, "normal");
});

test("reveal payloads preserve captions and voice note flags", () => {
  const image = buildRevealMessage({
    type: "imageMessage",
    value: { caption: "my caption" },
    buffer: Buffer.from("img"),
  });
  assert.ok(Buffer.isBuffer(image.image));
  assert.equal(image.caption, "my caption");

  const audio = buildRevealMessage({
    type: "audioMessage",
    value: { ptt: true },
    buffer: Buffer.from("ogg"),
    mimetype: "audio/ogg",
  });
  assert.equal(audio.ptt, true);
  assert.equal(audio.mimetype, "audio/ogg; codecs=opus");

  const sticker = buildRevealMessage({ type: "stickerMessage", buffer: Buffer.from("stk") });
  assert.ok(Buffer.isBuffer(sticker.sticker));
});

test("vv and vvpr reject replies without a view once message", async () => {
  const store = { feature: () => true };
  for (const name of ["vv", "vvpr"]) {
    await assert.rejects(
      command(name).execute({
        store,
        details: { quoted: null },
        send: async () => {},
        reply: async () => {},
      }),
      /Reply to a view once/,
    );
    await assert.rejects(
      command(name).execute({
        store,
        details: { quoted: { message: { imageMessage: { caption: "plain" } } } },
        send: async () => {},
        reply: async () => {},
      }),
      /not a view once/,
    );
  }
});

test("view once commands respect the vvCmd feature toggle", async () => {
  const store = { feature: () => false };
  await assert.rejects(
    command("vv").execute({
      store,
      details: { quoted: { message: {} } },
      send: async () => {},
      reply: async () => {},
    }),
    /disabled/,
  );
});

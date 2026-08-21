import assert from "node:assert/strict";
import test from "node:test";
import webpMux from "node-webpmux";
import sharp from "sharp";
import { Sticker, StickerTypes } from "../System/Sticker.js";

async function createInput() {
  return sharp({
    create: {
      width: 800,
      height: 400,
      channels: 4,
      background: "#00ff00",
    },
  })
    .png()
    .toBuffer();
}

test("static stickers are resized and contain WhatsApp pack metadata", async () => {
  const output = await new Sticker(await createInput(), {
    pack: "VENOM MD BOT",
    author: "TAPRUSH EMP (Micheal)",
    type: StickerTypes.FULL,
    categories: ["🐍"],
    id: "venom-test-pack",
  }).toBuffer();

  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);

  const webp = new webpMux.Image();
  await webp.load(output);
  assert.ok(webp.exif);
  assert.deepEqual(JSON.parse(webp.exif.subarray(22).toString("utf8")), {
    "sticker-pack-id": "venom-test-pack",
    "sticker-pack-name": "VENOM MD BOT",
    "sticker-pack-publisher": "TAPRUSH EMP (Micheal)",
    emojis: ["🐍"],
  });
});

test("animated GIF stickers retain their frames and timing", async () => {
  const width = 16;
  const pageHeight = 16;
  const pages = 2;
  const pixels = Buffer.alloc(width * pageHeight * pages * 4);
  for (let page = 0; page < pages; page += 1) {
    const start = page * width * pageHeight * 4;
    const end = start + width * pageHeight * 4;
    for (let offset = start; offset < end; offset += 4) {
      pixels[offset] = page === 0 ? 255 : 0;
      pixels[offset + 1] = page === 1 ? 255 : 0;
      pixels[offset + 3] = 255;
    }
  }
  const gif = await sharp(pixels, {
    raw: { width, height: pageHeight * pages, channels: 4, pageHeight },
  })
    .gif({ loop: 0, delay: [80, 120] })
    .toBuffer();

  const output = await new Sticker(gif, {
    pack: "VENOM MD BOT",
    author: "TAPRUSH EMP (Micheal)",
    type: StickerTypes.FULL,
  }).toBuffer();
  const metadata = await sharp(output, { animated: true }).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.pages, 2);
  assert.equal(metadata.pageHeight, 512);
  assert.deepEqual(metadata.delay, [80, 120]);
});

test("sticker input cannot escape the repository or target private networks", async () => {
  await assert.rejects(
    new Sticker("../outside.png").toBuffer(),
    /inside the bot directory/,
  );
  await assert.rejects(
    new Sticker("http://example.com/image.png").toBuffer(),
    /must use HTTPS/,
  );
  await assert.rejects(
    new Sticker("https://127.0.0.1/image.png").toBuffer(),
    /Private network/,
  );
  await assert.rejects(
    new Sticker("https://[::1]/image.png").toBuffer(),
    /Private network/,
  );
});

test("sticker input rejects empty and unsupported buffers", async () => {
  await assert.rejects(new Sticker(Buffer.alloc(0)).toBuffer(), /empty/);
  await assert.rejects(
    new Sticker(Buffer.from("not an image")).toBuffer(),
    /Unsupported sticker media type/,
  );
});

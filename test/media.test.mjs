import assert from "node:assert/strict";
import test from "node:test";

import webp from "node-webpmux";
import sharp from "sharp";

import {
  addStickerMetadata,
  imageToSticker,
  stickerToImage,
} from "../src/services/media.js";

test("image stickers are resized and branded with VENOM metadata", async () => {
  const input = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 4,
      background: "#39ff14",
    },
  })
    .png()
    .toBuffer();
  const converted = await imageToSticker(input);
  const sticker = await addStickerMetadata(
    converted,
    "VENOM MD BOT",
    "TAPRUSH EMP (Micheal)",
  );

  const metadata = await sharp(sticker).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);

  const image = new webp.Image();
  await image.load(sticker);
  assert.match(image.exif.toString("utf8"), /VENOM MD BOT/);
  assert.match(image.exif.toString("utf8"), /TAPRUSH EMP/);
});

test("sticker-to-image produces a PNG", async () => {
  const webpBuffer = await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#000000" },
  })
    .webp()
    .toBuffer();
  const png = await stickerToImage(webpBuffer);
  assert.equal((await sharp(png).metadata()).format, "png");
});

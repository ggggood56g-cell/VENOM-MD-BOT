import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { renderTextStyle } from "../src/services/textmaker.js";

test("textmaker creates a branded PNG without external APIs", async () => {
  const image = await renderTextStyle("VENOM POWER", "neontext");
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 675);
});

test("textmaker safely escapes markup and supports square output", async () => {
  const image = await renderTextStyle("<VENOM & USER>", "ttp", { square: true });
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.width, 768);
  assert.equal(metadata.height, 768);
  await assert.rejects(() => renderTextStyle("", "fire"), /Enter text/);
});

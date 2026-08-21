import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cacheDirectory = new URL("../System/Cache/", import.meta.url);

async function cacheFiles() {
  try {
    return (await fs.readdir(cacheDirectory)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

test("reaction GIF conversion uses the shared FFmpeg wrapper and cleans temporary files", async (t) => {
  if (process.platform === "win32") {
    t.skip("The test FFmpeg shim is a POSIX shell script.");
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "venom-reaction-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fakeFfmpeg = path.join(root, "ffmpeg");
  await fs.writeFile(
    fakeFfmpeg,
    `#!/bin/sh
input=""
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-i" ]; then
    shift
    input="$1"
  fi
  output="$1"
  shift
done
cp "$input" "$output"
`,
    { mode: 0o700 },
  );

  process.env.FFMPEG_PATH = fakeFfmpeg;
  const before = await cacheFiles();
  const { GIFBufferToVideoBuffer } = await import("../System/Function2.js");
  const input = Buffer.from("bounded reaction GIF fixture");
  const output = await GIFBufferToVideoBuffer(input);

  assert.deepEqual(output, input);
  assert.deepEqual(await cacheFiles(), before);
});

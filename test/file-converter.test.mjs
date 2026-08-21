import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ffmpeg, resolveFfmpegPath } from "../System/File-Converter.js";

test("FFmpeg wrapper rejects empty and non-buffer inputs before execution", async () => {
  await assert.rejects(ffmpeg(Buffer.alloc(0)), {
    name: "TypeError",
    message: "FFmpeg input must be a non-empty buffer.",
  });
  await assert.rejects(ffmpeg("not a buffer"), {
    name: "TypeError",
    message: "FFmpeg input must be a non-empty buffer.",
  });
});

test("FFmpeg wrapper rejects non-string arguments before writing media", async () => {
  await assert.rejects(ffmpeg(Buffer.from("media"), ["-f", 123]), {
    name: "TypeError",
    message: "FFmpeg arguments must be an array of strings.",
  });
});

test("FFmpeg resolver expands a relative configured executable against cwd", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "venom-ffmpeg-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, "tools", "ffmpeg-custom");
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

  assert.equal(
    resolveFfmpegPath({
      configuredPath: "./tools/ffmpeg-custom",
      staticPath: null,
      pathValue: "",
      cwd: root,
    }),
    executable,
  );
});

test("FFmpeg resolver searches PATH and ignores missing configured files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "venom-ffmpeg-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const executable = path.join(root, executableName);
  await fs.writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

  assert.equal(
    resolveFfmpegPath({
      configuredPath: "./does-not-exist",
      staticPath: "/also/missing/ffmpeg",
      pathValue: root,
      cwd: root,
    }),
    executable,
  );
});

test("FFmpeg resolver returns null when no executable is available", () => {
  assert.equal(
    resolveFfmpegPath({
      configuredPath: "./does-not-exist",
      staticPath: "/also/missing/ffmpeg",
      pathValue: "",
      cwd: process.cwd(),
    }),
    null,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { parseYouTubeResults } from "../src/services/youtube.js";

test("YouTube parser extracts bounded original result fields", () => {
  const renderer = {
    videoId: "abcdefghijk",
    title: { runs: [{ text: "VENOM Test Video" }] },
    lengthText: { simpleText: "3:21" },
    viewCountText: { simpleText: "12,345 views" },
    ownerText: { runs: [{ text: "VENOM Channel" }] },
    nested: { text: "a brace } and an escaped quote \" inside a string" },
  };
  const html = `<script>{"videoRenderer":${JSON.stringify(renderer)}}</script>`;
  const results = parseYouTubeResults(html, 1);
  assert.deepEqual(results, [
    {
      title: "VENOM Test Video",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      duration: "3:21",
      views: 12345,
      author: "VENOM Channel",
    },
  ]);
});

test("YouTube parser ignores malformed IDs and deduplicates videos", () => {
  const valid = JSON.stringify({
    videoId: "abcdefghijk",
    title: { simpleText: "One" },
  });
  const invalid = JSON.stringify({ videoId: "bad", title: { simpleText: "Bad" } });
  const results = parseYouTubeResults(
    `{"videoRenderer":${invalid}},{"videoRenderer":${valid}},{"videoRenderer":${valid}}`,
    5,
  );
  assert.equal(results.length, 1);
});

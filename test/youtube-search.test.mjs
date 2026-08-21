import assert from "node:assert/strict";
import test from "node:test";
import { __testables } from "../System/YouTubeSearch.js";

const renderer = {
  videoId: "abcdefghijk",
  title: { runs: [{ text: "VENOM MD BOT tutorial" }] },
  lengthText: { simpleText: "3:21" },
  thumbnail: {
    thumbnails: [
      { url: "http://insecure.example/low.jpg" },
      { url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" },
    ],
  },
};

test("YouTube initial data parser handles braces and escapes inside strings", () => {
  const data = {
    note: 'a brace } and an escaped quote " remain part of this value',
    contents: [{ videoRenderer: renderer }],
  };
  const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
  assert.deepEqual(__testables.extractInitialData(html), data);
});

test("YouTube result collection returns bounded normalized videos", () => {
  const data = {
    contents: [
      { videoRenderer: renderer },
      { compactVideoRenderer: renderer },
      {
        videoRenderer: {
          ...renderer,
          videoId: "invalid",
        },
      },
    ],
  };
  assert.deepEqual(__testables.collectVideos(data, 10).videos, [
    {
      type: "video",
      videoId: "abcdefghijk",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "VENOM MD BOT tutorial",
      timestamp: "3:21",
      thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    },
  ]);
});

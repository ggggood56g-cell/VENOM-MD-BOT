import assert from "node:assert/strict";
import test from "node:test";

import { fetchJson } from "../src/services/http.js";

test("protected HTTP helper rejects untrusted hosts and insecure protocols", async () => {
  await assert.rejects(
    () => fetchJson("http://api.jikan.moe/v4/anime", { allowedHosts: ["api.jikan.moe"] }),
    /not trusted/,
  );
  await assert.rejects(
    () => fetchJson("https://127.0.0.1/private", { allowedHosts: ["api.jikan.moe"] }),
    /not trusted/,
  );
  await assert.rejects(
    () => fetchJson("https://api.jikan.moe.evil.example/data", { allowedHosts: ["api.jikan.moe"] }),
    /not trusted/,
  );
});

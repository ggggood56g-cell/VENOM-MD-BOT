import assert from "node:assert/strict";
import dns from "node:dns";
import test from "node:test";

import {
  MAX_REDIRECTS,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  assertPublicHttpUrl,
  assertPublicRedirect,
  isPrivateAddress,
  publicHttp,
  publicHttpAgent,
  publicHttpsAgent,
} from "../src/lib/network.js";
import { assertDownloaderTarget } from "../src/lib/downloader.js";

const PRIVATE_ADDRESSES = [
  "0.0.0.0",
  "10.10.10.10",
  "100.64.0.1",
  "127.0.0.1",
  "169.254.169.254",
  "172.31.255.255",
  "192.168.1.1",
  "198.18.0.1",
  "224.0.0.1",
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "fc00::1",
  "fe80::1",
  "ff02::1",
  "2001:db8::1",
];

test("network address classification rejects local and special-use ranges", () => {
  for (const address of PRIVATE_ADDRESSES) {
    assert.equal(isPrivateAddress(address), true, `${address} must be rejected`);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
  assert.equal(isPrivateAddress("not-an-address"), true);
});

test("public URL validation rejects credentials, schemes, and literal local targets", async () => {
  for (const value of [
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://user:secret@example.com/file",
    "http://localhost/admin",
    "http://service.internal/admin",
    "http://127.0.0.1/admin",
    "http://[::1]/admin",
    "http://169.254.169.254/latest/meta-data/",
  ]) {
    await assert.rejects(assertPublicHttpUrl(value), /public|private|credentials/i, value);
  }

  assert.equal((await assertPublicHttpUrl("https://8.8.8.8/file")).hostname, "8.8.8.8");
  assert.equal(
    (await assertPublicHttpUrl("https://[2606:4700:4700::1111]/file")).hostname,
    "[2606:4700:4700::1111]",
  );
});

test("DNS validation fails closed when any answer is private", async (t) => {
  const original = dns.promises.lookup;
  t.after(() => {
    dns.promises.lookup = original;
  });

  dns.promises.lookup = async (hostname) => {
    assert.equal(hostname, "media.example.com");
    return [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
  };
  await assert.rejects(
    assertPublicHttpUrl("https://media.example.com/file"),
    /private network/i,
  );

  dns.promises.lookup = async () => [
    { address: "93.184.216.34", family: 4 },
  ];
  assert.equal(
    (await assertPublicHttpUrl("https://media.example.com/file")).hostname,
    "media.example.com",
  );
});

test("redirect validation rejects private literals and redirect credentials", () => {
  assert.throws(
    () => assertPublicRedirect({ protocol: "http:", hostname: "127.0.0.1", path: "/admin" }),
    /private network/i,
  );
  assert.throws(
    () => assertPublicRedirect({ protocol: "https:", hostname: "example.com", auth: "a:b" }),
    /credentials/i,
  );
  assert.throws(
    () => assertPublicRedirect({ protocol: "file:", hostname: "example.com", path: "/tmp/a" }),
    /HTTP and HTTPS/i,
  );
  assert.doesNotThrow(() =>
    assertPublicRedirect({ protocol: "https:", hostname: "cdn.example.com", path: "/media" }),
  );
});

test("protected HTTP requests retain agents, redirect checks, and hard size limits", async (t) => {
  const original = dns.promises.lookup;
  t.after(() => {
    dns.promises.lookup = original;
  });
  dns.promises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];

  let seen;
  await publicHttp.get("https://media.example.com/file", {
    proxy: { host: "127.0.0.1", port: 8080 },
    maxRedirects: 999,
    maxContentLength: -1,
    maxBodyLength: Number.MAX_SAFE_INTEGER,
    beforeRedirect: () => {},
    adapter: async (config) => {
      seen = config;
      return {
        data: "ok",
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });

  assert.equal(seen.proxy, false);
  assert.equal(seen.httpAgent, publicHttpAgent);
  assert.equal(seen.httpsAgent, publicHttpsAgent);
  assert.equal(seen.beforeRedirect, assertPublicRedirect);
  assert.equal(seen.maxRedirects, MAX_REDIRECTS);
  assert.equal(seen.maxContentLength, MAX_RESPONSE_BYTES);
  assert.equal(seen.maxBodyLength, MAX_REQUEST_BYTES);
});

test("yt-dlp targets accept bounded internal searches but reject SSRF targets", async () => {
  assert.equal(await assertDownloaderTarget("ytsearch5:VENOM MD BOT"), "ytsearch5:VENOM MD BOT");
  assert.equal(await assertDownloaderTarget("scsearch3:Afrobeats"), "scsearch3:Afrobeats");
  await assert.rejects(assertDownloaderTarget("ytsearch123:test"), /public/i);
  await assert.rejects(assertDownloaderTarget("http://127.0.0.1/video"), /private network/i);
  await assert.rejects(assertDownloaderTarget("file:///etc/passwd"), /public HTTP/i);
  await assert.rejects(assertDownloaderTarget("ytsearch1:" + "a".repeat(501)), /too long/i);
});

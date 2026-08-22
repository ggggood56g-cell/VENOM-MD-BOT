import assert from "node:assert/strict";
import test from "node:test";

import plugins from "../src/plugins/index.js";

const command = (name) => plugins.find((plugin) => plugin.name === name);

test("QR command generates a real PNG buffer", async () => {
  let output;
  await command("qrcode").execute({
    query: "https://github.com/MykelGoal/VENOM-MD-BOT",
    prefix: ".",
    send: async (content) => { output = content; },
  });
  assert.ok(Buffer.isBuffer(output.image));
  assert.deepEqual([...output.image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("PDF command creates a real PDF document", async () => {
  let output;
  await command("pdf").execute({
    query: "VENOM MD BOT test document",
    send: async (content) => { output = content; },
  });
  assert.ok(Buffer.isBuffer(output.document));
  assert.equal(output.document.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(output.mimetype, "application/pdf");
});

test("tic-tac-toe command starts and accepts a valid move", async () => {
  const replies = [];
  const context = {
    chat: "game-test@g.us",
    args: ["start"],
    prefix: ".",
    reply: async (text) => replies.push(text),
  };
  await command("ttt").execute(context);
  context.args = ["5"];
  await command("ttt").execute(context);
  assert.match(replies[0], /TIC-TAC-TOE/);
  assert.ok(replies.length === 2);
  assert.match(replies[1], /X/);
});

test("word-chain command enforces the required starting letter", async () => {
  const replies = [];
  const context = {
    chat: "word-game-test@g.us",
    args: ["start"],
    prefix: ".",
    reply: async (text) => replies.push(text),
  };
  await command("wcg").execute(context);
  const required = replies[0].match(/start with \*(.)\*/)?.[1];
  context.args = [`${required}est`];
  await command("wcg").execute(context);
  assert.match(replies[1], /accepted/);
});

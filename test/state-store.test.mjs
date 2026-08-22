import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import StateStore from "../src/state-store.js";

function fakeDatabase() {
  return { collection: () => null };
}

test("state store persists economy transfers and bot bans", async (context) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-state-test-"));
  context.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const config = {
    root,
    mode: "public",
    prefixes: ["."],
    sessionNamespace: "test",
  };
  const store = await new StateStore(config, fakeDatabase()).init();
  const first = "11111111111@s.whatsapp.net";
  const second = "22222222222@s.whatsapp.net";

  await store.updateEconomy(first, (account) => ({ ...account, wallet: 2_000 }));
  await store.transferMoney(first, second, 750);
  assert.equal(store.economy(first).wallet, 1_250);
  assert.equal(store.economy(second).wallet, 1_250);

  await store.setBanned(second, true);
  await store.setNote(first, "idea", "Build the best VENOM menu.");
  await store.setFeature("autoTyping", true);
  await store.setCustomCommand("rules", "Respect everyone.");
  await store.setFilter("group", "test@g.us", "hello", "Welcome!");
  await store.setAfk(first, "Testing VENOM");
  await store.addReminder({
    id: "test-reminder",
    owner: first,
    chat: "test@g.us",
    text: "Run tests",
    dueAt: Date.now() + 60_000,
  });
  assert.equal(store.isBanned(second), true);
  assert.equal(store.notes(first).idea, "Build the best VENOM menu.");
  assert.equal(store.feature("autoTyping"), true);
  assert.equal(store.customCommand("rules"), "Respect everyone.");
  assert.equal(store.filterResponse("HELLO", "test@g.us", true), "Welcome!");
  assert.equal(store.afk(first).reason, "Testing VENOM");
  assert.equal(store.reminders(first).length, 1);
  await store.close();

  const restored = await new StateStore(config, fakeDatabase()).init();
  assert.equal(restored.economy(first).wallet, 1_250);
  assert.equal(restored.economy(second).wallet, 1_250);
  assert.equal(restored.isBanned(second), true);
  assert.equal(restored.notes(first).idea, "Build the best VENOM menu.");
  assert.equal(restored.feature("autoTyping"), true);
  assert.equal(restored.customCommand("rules"), "Respect everyone.");
  assert.equal(restored.filterResponse("hello", "test@g.us", true), "Welcome!");
  assert.equal(restored.afk(first).reason, "Testing VENOM");
  assert.equal(restored.reminders(first)[0].text, "Run tests");
});

test("state store bounds invalid economy values", async (context) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venom-state-bounds-"));
  context.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const store = await new StateStore(
    { root, mode: "public", prefixes: ["."], sessionNamespace: "test" },
    fakeDatabase(),
  ).init();
  const jid = "33333333333@s.whatsapp.net";
  await store.updateEconomy(jid, { wallet: -5, bank: Number.POSITIVE_INFINITY, bankLimit: 1 });
  assert.deepEqual(
    {
      wallet: store.economy(jid).wallet,
      bank: store.economy(jid).bank,
      bankLimit: store.economy(jid).bankLimit,
    },
    { wallet: 0, bank: 0, bankLimit: 5_000 },
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { telegramDetails } from "../src/adapters/telegram-message.js";
import TelegramSocket, {
  chatIdFromJid,
  chunkText,
  jidFromChat,
  jidFromUser,
  toTelegramHtml,
} from "../src/adapters/telegram-socket.js";

const BOT_ID = 900;

function fakeTelegram() {
  const calls = [];
  const record = (method) => (...args) => {
    calls.push({ method, args });
    return Promise.resolve({ message_id: calls.length });
  };
  return {
    calls,
    sendMessage: record("sendMessage"),
    sendPhoto: record("sendPhoto"),
    sendVideo: record("sendVideo"),
    sendAnimation: record("sendAnimation"),
    sendSticker: record("sendSticker"),
    sendAudio: record("sendAudio"),
    sendVoice: record("sendVoice"),
    sendDocument: record("sendDocument"),
    sendPoll: record("sendPoll"),
    sendChatAction: record("sendChatAction"),
    deleteMessage: record("deleteMessage"),
    setMessageReaction: record("setMessageReaction"),
    getChat: () => Promise.resolve({ id: -100, title: "Venom Group", description: "d" }),
    getChatAdministrators: () =>
      Promise.resolve([
        { status: "creator", user: { id: 1, first_name: "Boss" } },
        { status: "administrator", user: { id: 2, first_name: "Mod" } },
      ]),
    getChatMemberCount: () => Promise.resolve(42),
    banChatMember: record("banChatMember"),
    unbanChatMember: record("unbanChatMember"),
    promoteChatMember: record("promoteChatMember"),
  };
}

test("jid mapping keeps private and group chats distinguishable", () => {
  assert.equal(jidFromChat({ id: 555, type: "private" }), "555@s.whatsapp.net");
  assert.equal(jidFromChat({ id: -1001234, type: "supergroup" }), "-1001234@g.us");
  assert.equal(jidFromUser({ id: 77 }), "77@s.whatsapp.net");
  assert.equal(chatIdFromJid("-1001234@g.us"), -1001234);
  assert.equal(chatIdFromJid("555@s.whatsapp.net"), 555);
});

test("WhatsApp markup converts to Telegram HTML and escapes injection", () => {
  assert.equal(toTelegramHtml("*bold*"), "<b>bold</b>");
  assert.equal(toTelegramHtml("_italic_"), "<i>italic</i>");
  assert.equal(toTelegramHtml("`code`"), "<code>code</code>");
  assert.equal(toTelegramHtml("<script>"), "&lt;script&gt;");
  assert.equal(toTelegramHtml("a & b"), "a &amp; b");
});

test("long text splits into 4096-char chunks on line boundaries", () => {
  const menu = Array.from({ length: 900 }, (_, i) => `command-number-${i}`).join("\n");
  const chunks = chunkText(menu);
  assert.ok(chunks.length > 1, "expected the 633-command menu to split");
  for (const chunk of chunks) assert.ok(chunk.length <= 4096);
  assert.equal(chunks.join("\n"), menu, "no content may be lost when splitting");
});

test("details() produces the same shape src/message.js does", () => {
  const details = telegramDetails(
    {
      message: {
        message_id: 12,
        date: 1700000000,
        chat: { id: -1009, type: "supergroup" },
        from: { id: 5, first_name: "Ada", last_name: "L" },
        text: "/menu@venombot",
      },
    },
    BOT_ID,
  );

  assert.equal(details.chat, "-1009@g.us");
  assert.equal(details.sender, "5@s.whatsapp.net");
  assert.equal(details.isGroup, true);
  assert.equal(details.isStatus, false);
  assert.equal(details.fromMe, false);
  assert.equal(details.pushName, "Ada L");
  assert.equal(details.text, "/menu@venombot");
  assert.equal(details.raw.key.remoteJid, "-1009@g.us");
  assert.equal(details.raw.key.id, "12");
  assert.deepEqual(details.mentionedJids, []);
});

test("replied-to media becomes a quoted message with a resolvable file id", () => {
  const details = telegramDetails(
    {
      message: {
        message_id: 20,
        chat: { id: 7, type: "private" },
        from: { id: 7, first_name: "Ada" },
        text: ".sticker",
        reply_to_message: {
          message_id: 19,
          chat: { id: 7, type: "private" },
          from: { id: 7, first_name: "Ada" },
          photo: [
            { file_id: "small", file_size: 100 },
            { file_id: "large", file_size: 900 },
          ],
        },
      },
    },
    BOT_ID,
  );

  assert.ok(details.quoted, "expected a quoted message");
  assert.equal(details.quoted.message.imageMessage.telegramFileId, "large");
  assert.equal(details.sender, "7@s.whatsapp.net");
  assert.equal(details.isGroup, false);
});

test("socket routes each Baileys content shape to the right Telegram method", async () => {
  const telegram = fakeTelegram();
  const socket = new TelegramSocket(telegram, { botInfo: { id: BOT_ID, first_name: "Venom" } });
  const jid = "42@s.whatsapp.net";

  await socket.sendMessage(jid, { text: "hello" });
  await socket.sendMessage(jid, { image: Buffer.from("x"), caption: "pic" });
  await socket.sendMessage(jid, { video: Buffer.from("x") });
  await socket.sendMessage(jid, { sticker: Buffer.from("x") });
  await socket.sendMessage(jid, { audio: Buffer.from("x"), ptt: true });
  await socket.sendMessage(jid, { document: Buffer.from("x"), fileName: "a.pdf" });
  await socket.sendMessage(jid, { poll: { name: "q", values: ["a", "b"] } });

  assert.deepEqual(
    telegram.calls.map((call) => call.method),
    ["sendMessage", "sendPhoto", "sendVideo", "sendSticker", "sendVoice", "sendDocument", "sendPoll"],
  );
  assert.equal(telegram.calls[0].args[0], 42, "chat id must be numeric for Telegram");
});

test("react and delete map onto the Telegram equivalents", async () => {
  const telegram = fakeTelegram();
  const socket = new TelegramSocket(telegram, { botInfo: { id: BOT_ID } });

  await socket.sendMessage("42@s.whatsapp.net", { react: { text: "⚡", key: { id: "5" } } });
  await socket.sendMessage("42@s.whatsapp.net", { delete: { id: "5" } });

  assert.equal(telegram.calls[0].method, "setMessageReaction");
  assert.equal(telegram.calls[1].method, "deleteMessage");
});

test("groupMetadata returns Baileys-shaped participants with admin flags", async () => {
  const telegram = fakeTelegram();
  const socket = new TelegramSocket(telegram, { botInfo: { id: BOT_ID } });

  const metadata = await socket.groupMetadata("-100@g.us");
  assert.equal(metadata.subject, "Venom Group");
  assert.equal(metadata.size, 42);
  assert.equal(metadata.owner, "1@s.whatsapp.net");
  assert.equal(metadata.participants[0].admin, "superadmin");
  assert.equal(metadata.participants[1].admin, "admin");
});

test("kick issues ban+unban so the user can rejoin later", async () => {
  const telegram = fakeTelegram();
  const socket = new TelegramSocket(telegram, { botInfo: { id: BOT_ID } });

  const result = await socket.groupParticipantsUpdate("-100@g.us", ["9@s.whatsapp.net"], "remove");
  assert.equal(result[0].status, "200");
  assert.deepEqual(
    telegram.calls.map((call) => call.method),
    ["banChatMember", "unbanChatMember"],
  );
});

test("unsupported WhatsApp-only calls fail with a readable message", async () => {
  const socket = new TelegramSocket(fakeTelegram(), { botInfo: { id: BOT_ID } });
  await assert.rejects(() => socket.groupCreate(), /cannot create groups/i);
  await assert.rejects(() => socket.updateBlockStatus(), /cannot block users/i);
  assert.deepEqual(await socket.onWhatsApp(), []);
});

test("mentions become tappable tg://user links instead of bare digits", async () => {
  const { applyMentions } = await import("../src/adapters/telegram-socket.js");
  const rendered = applyMentions("• @42 • @900", ["42@s.whatsapp.net", "900@s.whatsapp.net"]);
  assert.equal(
    rendered,
    '• <a href="tg://user?id=42">@42</a> • <a href="tg://user?id=900">@900</a>',
  );
  assert.equal(applyMentions("no mentions", []), "no mentions");
});

test("invite links point at t.me on Telegram and wa.me on WhatsApp", async () => {
  const { inviteUrl } = await import("../src/utils.js");
  assert.equal(inviteUrl({ platform: "telegram" }, "abc123"), "https://t.me/+abc123");
  assert.equal(inviteUrl({ platform: "telegram" }, "+abc123"), "https://t.me/+abc123");
  assert.equal(inviteUrl({}, "abc123"), "https://chat.whatsapp.com/abc123");
});

// ── Inline keyboard UI ───────────────────────────────────────────────

const registryStub = {
  _all: [
    { name: "ping", category: "general", description: "Check latency.", aliases: ["p"] },
    { name: "menu", category: "general", description: "Show commands." },
    { name: "sticker", category: "media", description: "Make a sticker.", usage: "sticker <media>" },
    { name: "kick", category: "group", description: "Remove a member.", adminOnly: true, groupOnly: true },
    ...Array.from({ length: 60 }, (_, i) => ({
      name: `art${String(i).padStart(2, "0")}`,
      category: "textmaker",
      description: `Art ${i}`,
    })),
  ],
  list() {
    return this._all;
  },
  routableCount() {
    return this._all.length;
  },
  find(name) {
    return this._all.find((command) => command.name === name);
  },
};

test("home keyboard lists every category with counts and link buttons", async () => {
  const { homeKeyboard } = await import("../src/adapters/telegram-ui.js");
  const keyboard = homeKeyboard(registryStub, {
    repo: "https://github.com/MykelGoal/VENOM-MD-BOT",
    youtube: "https://youtube.com/@venommdbot",
  });
  const flat = keyboard.inline_keyboard.flat();

  const textmaker = flat.find((button) => button.text.includes("Text Art"));
  assert.ok(textmaker, "expected a Text Art category button");
  assert.match(textmaker.text, /60$/, "count should be shown on the button");
  assert.equal(textmaker.callback_data, "m:c:textmaker:0");

  assert.ok(flat.some((button) => button.url?.includes("github.com")), "star link missing");
  assert.ok(flat.some((button) => button.url?.includes("youtube")), "youtube link missing");
  for (const row of keyboard.inline_keyboard) assert.ok(row.length <= 3);
});

test("category pages stay inside Telegram limits and navigate correctly", async () => {
  const { categoryKeyboard } = await import("../src/adapters/telegram-ui.js");

  const first = categoryKeyboard(registryStub, "textmaker", 0);
  assert.equal(first.total, 60);
  assert.equal(first.pages, 3);
  assert.equal(first.page, 0);

  const nav = first.keyboard.inline_keyboard.at(-2);
  assert.equal(nav[0].callback_data, "m:noop", "no Prev on the first page");
  assert.equal(nav[1].text, "1/3");
  assert.equal(nav[2].callback_data, "m:c:textmaker:1");

  const last = categoryKeyboard(registryStub, "textmaker", 2);
  assert.equal(last.page, 2);
  assert.equal(last.keyboard.inline_keyboard.at(-2)[2].callback_data, "m:noop");

  // Out-of-range pages clamp instead of rendering an empty keyboard.
  assert.equal(categoryKeyboard(registryStub, "textmaker", 99).page, 2);
  assert.equal(categoryKeyboard(registryStub, "textmaker", -5).page, 0);

  for (const row of last.keyboard.inline_keyboard) assert.ok(row.length <= 3);
});

test("every callback payload fits Telegram's 64-byte limit", async () => {
  const { categoryKeyboard, homeKeyboard, helpCard } = await import("../src/adapters/telegram-ui.js");
  const payloads = [
    ...homeKeyboard(registryStub, {}).inline_keyboard.flat(),
    ...categoryKeyboard(registryStub, "textmaker", 0).keyboard.inline_keyboard.flat(),
    ...helpCard(registryStub.find("sticker"), ".").keyboard.inline_keyboard.flat(),
  ]
    .map((button) => button.callback_data)
    .filter(Boolean);

  assert.ok(payloads.length > 0);
  for (const payload of payloads) {
    assert.ok(Buffer.byteLength(payload) <= 64, `payload too long: ${payload}`);
  }
});

test("help card shows a Run button only for argument-free commands", async () => {
  const { helpCard } = await import("../src/adapters/telegram-ui.js");

  const ping = helpCard(registryStub.find("ping"), ".");
  const runButton = ping.keyboard.inline_keyboard.flat().find((b) => b.text.startsWith("▶️"));
  assert.ok(runButton, "ping should be runnable from a button");
  assert.equal(runButton.callback_data, "m:r:ping");
  assert.match(ping.text, /Aliases:/);

  // Needs media, so running it blind would just error.
  const sticker = helpCard(registryStub.find("sticker"), ".");
  assert.ok(!sticker.keyboard.inline_keyboard.flat().some((b) => b.text.startsWith("▶️")));
  assert.match(sticker.text, /Usage:/);

  // Permission flags are surfaced to the user.
  const kick = helpCard(registryStub.find("kick"), ".");
  assert.match(kick.text, /admins only/);
  assert.match(kick.text, /groups only/);
  assert.ok(!kick.keyboard.inline_keyboard.flat().some((b) => b.text.startsWith("▶️")));
});

test("inline keyboards pass through the send path", () => {
  const markup = { inline_keyboard: [[{ text: "Go", callback_data: "m" }]] };
  assert.deepEqual(TelegramSocket.extra({ reply_markup: markup }).reply_markup, markup);
  assert.deepEqual(
    TelegramSocket.extra({ buttons: [[{ text: "Go", callback_data: "m" }]] }).reply_markup,
    markup,
  );
  assert.equal(TelegramSocket.extra({}).reply_markup, undefined);
});

test("malformed updates are ignored instead of crashing the poller", () => {
  assert.equal(telegramDetails(undefined, BOT_ID), null);
  assert.equal(telegramDetails({}, BOT_ID), null);
  assert.equal(telegramDetails({ message: {} }, BOT_ID), null);
});

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

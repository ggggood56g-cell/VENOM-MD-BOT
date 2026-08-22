import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { downloadMedia, mediaMessage } from "../message.js";
import { fetchBuffer, postJson } from "../services/http.js";
import { jidNumber } from "../utils.js";

// thum.io provides free key-less website screenshots.
const THUM = "https://image.thum.io/get";
const MAIL_API = "https://api.mail.tm";

async function screenshot(context, kind) {
  const target = (context.query.match(/https?:\/\/\S+/) || [])[0];
  if (!target) throw new Error("Send a website URL.");
  const options = {
    ss: "/width/1280/crop/800",
    ssfull: "/width/1280/noanimate",
    ssphone: "/width/420/crop/900",
    sstab: "/width/1280/crop/720/noanimate",
  }[kind];
  const { buffer, contentType } = await fetchBuffer(`${THUM}${options}/${target}`, {
    allowedHosts: ["image.thum.io", "thum.io"],
    maximumBytes: context.config.maxMediaBytes,
    timeout: 45_000,
  });
  if (!contentType.startsWith("image")) throw new Error("The screenshot service is unavailable right now.");
  await context.send({ image: buffer, caption: `🖥️ ${target}` });
}

async function mailAccount(context) {
  const stored = context.store.runtimeVar(`tempmail:${context.sender}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fall through and create a fresh account.
    }
  }
  const domains = await fetchJsonMail("/domains");
  const domain = domains["hydra:member"]?.[0]?.domain || domains[0]?.domain;
  if (!domain) throw new Error("Temp mail service returned no domain.");
  const address = `venom${Math.random().toString(36).slice(2, 10)}@${domain}`;
  const password = Math.random().toString(36).slice(2, 14);
  await postJson(`${MAIL_API}/accounts`, {
    json: { address, password },
    allowedHosts: ["api.mail.tm"],
    maximumBytes: 64 * 1024,
  });
  const token = await postJson(`${MAIL_API}/token`, {
    json: { address, password },
    allowedHosts: ["api.mail.tm"],
    maximumBytes: 64 * 1024,
  });
  const account = { address, password, token: token.token, id: Date.now() };
  await context.store.setRuntimeVar(`tempmail:${context.sender}`, JSON.stringify(account));
  return account;
}

async function fetchJsonMail(pathname) {
  const { buffer } = await fetchBuffer(`${MAIL_API}${pathname}`, {
    allowedHosts: ["api.mail.tm"],
    maximumBytes: 128 * 1024,
  });
  return JSON.parse(buffer.toString("utf8"));
}

export default [
  ...["ss", "ssfull", "ssphone", "sstab"].map((name) => ({
    name,
    category: "utility",
    description: `Take a ${name === "ss" ? "website" : name.replace("ss", "")} screenshot of a URL.`,
    usage: `${name} https://example.com`,
    execute: (context) => screenshot(context, name),
  })),
  {
    name: "fetch",
    category: "utility",
    description: "Fetch a URL and show its text or JSON content.",
    usage: "fetch <link>",
    async execute(context) {
      const target = (context.query.match(/https?:\/\/\S+/) || [])[0];
      if (!target) throw new Error("Send a URL.");
      const host = new URL(target).hostname;
      const { buffer, contentType } = await fetchBuffer(target, {
        allowedHosts: [host],
        maximumBytes: 512 * 1024,
        timeout: 30_000,
      });
      const body = buffer.toString("utf8");
      if (contentType.includes("image/")) {
        await context.send({ image: buffer, caption: `🖼️ ${target}` });
        return;
      }
      await context.reply(`🌐 *${contentType}*\n\n${body.slice(0, 3_000)}`);
    },
  },
  {
    name: "tempmail",
    category: "utility",
    description: "Create a temporary email address.",
    async execute(context) {
      const account = await mailAccount(context);
      await context.reply(
        `📧 *TEMP MAIL*\n${account.address}\n\nUse *${context.prefix}tempinbox* to read incoming mail.`,
      );
    },
  },
  {
    name: "tempinbox",
    category: "utility",
    description: "Check messages on your temporary mailbox.",
    async execute(context) {
      const account = await mailAccount(context);
      const messages = await fetchJsonMail("/messages?page=1");
      const items = messages["hydra:member"] || messages || [];
      if (!items.length) {
        await context.reply(`📭 No new mail for ${account.address}.`);
        return;
      }
      const rows = items.slice(0, 5).map(
        (message, index) => `${index + 1}. *${message.from?.name || message.from?.address || "?"}*\n${message.subject}`,
      );
      await context.reply(`📬 *INBOX — ${account.address}*\n\n${rows.join("\n")}`);
    },
  },
  {
    name: "temp-url",
    category: "utility",
    description: "Shorten a long URL.",
    usage: "temp-url https://example.com/very/long/link",
    async execute(context) {
      const target = (context.query.match(/https?:\/\/\S+/) || [])[0];
      if (!target) throw new Error("Send the URL to shorten.");
      const { buffer } = await fetchBuffer(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(target)}`,
        { allowedHosts: ["tinyurl.com"], maximumBytes: 2 * 1024 },
      );
      await context.reply(`🔗 ${buffer.toString("utf8").trim()}`);
    },
  },
  {
    name: "url",
    category: "utility",
    description: "Inspect any file or page behind a URL.",
    usage: "url <link>",
    async execute(context) {
      const target = (context.query.match(/https?:\/\/\S+/) || [])[0];
      if (!target) throw new Error("Send a URL.");
      const host = new URL(target).hostname;
      const { buffer, contentType } = await fetchBuffer(target, {
        allowedHosts: [host],
        maximumBytes: context.config.maxMediaBytes,
        timeout: 30_000,
      });
      await context.reply(
        `🌐 *URL info*\nHost: ${host}\nType: ${contentType}\nSize: ${(buffer.length / 1024).toFixed(1)} KB`,
      );
    },
  },
  {
    name: "track",
    category: "utility",
    description: "Track a link: where it really leads and who hosts it.",
    usage: "track <link>",
    async execute(context) {
      const target = (context.query.match(/https?:\/\/\S+/) || [])[0];
      if (!target) throw new Error("Send a URL to track.");
      const host = new URL(target).hostname;
      const { buffer, contentType } = await fetchBuffer(target, {
        allowedHosts: [host],
        maximumBytes: 256 * 1024,
        timeout: 30_000,
      });
      let server = "unknown";
      try {
        const who = await fetchBuffer(`https://ipwho.is/${host}`, {
          allowedHosts: ["ipwho.is"],
          maximumBytes: 64 * 1024,
        });
        const parsed = JSON.parse(who.buffer.toString("utf8"));
        if (parsed.success !== false) {
          server = `${parsed.country || "?"}${parsed.city ? ` (${parsed.city})` : ""} — ${parsed.connection?.isp || "?"}`;
        }
      } catch {
        // Server location is optional.
      }
      await context.reply(
        `🕵️ *Link tracker*\nHost: ${host}\nServes: ${contentType}\nSize: ${(buffer.length / 1024).toFixed(1)} KB\nServer: ${server}`,
      );
    },
  },
  {
    name: "hostinfo",
    aliases: ["botdevice"],
    category: "utility",
    description: "Show what the bot is running on.",
    async execute(context) {
      const user = context.socket?.user;
      await context.reply([
        "🖥️ *HOST INFO*",
        `Bot: ${context.config.botName} ${context.config.version}`,
        `WhatsApp: ${user ? jidNumber(user.id) : "not connected"}`,
        `Platform: ${os.platform()} (${os.arch()})`,
        `Node: ${process.version}`,
        `CPU cores: ${os.cpus().length}`,
        `Memory: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB total`,
        `Uptime: ${Math.floor(process.uptime() / 60)} minutes`,
      ].join("\n"));
    },
  },
  {
    name: "audio2text",
    category: "utility",
    description: "Transcribe a replied voice note (needs a Gemini key).",
    async execute(context) {
      const target = mediaMessage(context.details);
      if (!target) throw new Error("Reply to a voice note.");
      const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
      await context.react("🎙️").catch(() => {});
      const transcript = await context.ai.transcribeAudio(buffer, "audio/ogg");
      await context.reply(`📝 *Transcript*\n${transcript}`);
    },
  },
  {
    name: "shazam",
    category: "utility",
    description: "Identify a song from a replied audio or video (needs a Gemini key).",
    async execute(context) {
      const target = mediaMessage(context.details);
      if (!target) throw new Error("Reply to a song audio or video.");
      const buffer = await downloadMedia(context.socket, target, context.config.maxMediaBytes);
      await context.react("🎵").catch(() => {});
      const result = await context.ai.identifyAudio(buffer);
      await context.reply(`🎵 *Song identification*\n${result}`);
    },
  },
];

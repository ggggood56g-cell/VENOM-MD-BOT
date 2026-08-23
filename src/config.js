import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "enable", "enabled"].includes(
    String(value).trim().toLowerCase(),
  );
}

export function parseNumberList(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((item) => item.replace(/\D/g, ""))
        .filter((item) => item.length >= 7 && item.length <= 15),
    ),
  ].slice(0, 20);
}

export function parsePrefixes(value) {
  const prefixes = String(value || ".")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\S{1,4}$/u.test(item));
  return [...new Set(prefixes)].slice(0, 8).length
    ? [...new Set(prefixes)].slice(0, 8)
    : ["."];
}

export function parsePlatform(value) {
  const candidate = String(value || "whatsapp").trim().toLowerCase();
  return ["whatsapp", "telegram", "both"].includes(candidate) ? candidate : "whatsapp";
}

export function parseNamespace(value) {
  const candidate = String(value || "venom").trim();
  return /^[A-Za-z0-9_-]{1,48}$/.test(candidate) ? candidate : "venom";
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function safeUrl(value, fallback = "") {
  try {
    const parsed = new URL(String(value || fallback));
    return parsed.protocol === "https:" ? parsed.toString().replace(/\/$/, "") : fallback;
  } catch {
    return fallback;
  }
}

// No hardcoded fallback: an unset OWNER_NUMBER means "this deployment has no
// configured owner" rather than silently pointing at the upstream author's
// personal number. Owner-only commands still work for the linked account
// itself, because the router also grants owner rights on `fromMe` messages.
const owners = parseNumberList(process.env.OWNER_NUMBER || process.env.MODS || "");
const namespace = parseNamespace(process.env.SESSION_NAMESPACE);

// Consumed once and deleted, exactly like SESSION_ID, so no plugin or
// diagnostic output can ever echo the bot token back to a chat.
const telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
delete process.env.TELEGRAM_BOT_TOKEN;
const telegramOwners = [
  ...new Set(
    String(process.env.TELEGRAM_OWNER_ID || "")
      .split(",")
      .map((item) => item.replace(/\D/g, ""))
      .filter((item) => item.length >= 5 && item.length <= 15),
  ),
].slice(0, 20);

let pendingSessionCredential = String(process.env.SESSION_ID || "").trim();
const databaseUrl = String(
  process.env.DATABASE_URL || process.env.MONGODB || process.env.MONGO_URI || "",
).trim();

// Consume the session credential once and remove it from process.env so command
// modules and diagnostics cannot accidentally print it.
delete process.env.SESSION_ID;
export function consumeSessionCredential() {
  const credential = pendingSessionCredential;
  pendingSessionCredential = "";
  return credential;
}

export const config = Object.freeze({
  root: ROOT,
  botName: String(process.env.BOT_NAME || "VENOM MD BOT").trim().slice(0, 64),
  ownerName: String(
    process.env.OWNER_NAME || process.env.BOT_OWNER || "TAPRUSH EMP (Micheal)",
  )
    .trim()
    .slice(0, 64),
  // Owner identities are matched by digits only, and the Telegram adapter maps
  // a user id to "<id>@s.whatsapp.net", so both platforms share one allow-list.
  owners: Object.freeze([...new Set([...owners, ...telegramOwners])]),
  // NOTE: `platform` below is the runtime host string shown in .menu
  // ("nodejs"); this is the adapter selector. Distinct keys on purpose.
  platformMode: parsePlatform(process.env.PLATFORM),
  telegramToken,
  telegramOwners: Object.freeze(telegramOwners),
  description: String(
    process.env.DESCRIPTION || "Fast, secure and powerful WhatsApp automation.",
  )
    .trim()
    .slice(0, 180),
  version: String(process.env.BOT_VERSION || "v2.0.0").trim().slice(0, 24),
  platform: "nodejs",
  repository: "https://github.com/MykelGoal/VENOM-MD-BOT",
  prefixes: Object.freeze(
    parsePrefixes(process.env.PREFIXES || process.env.PREFIX),
  ),
  mode: String(process.env.COMMAND_MODE || process.env.MODE || "public").toLowerCase() ===
    "private"
    ? "private"
    : "public",
  timezone: String(process.env.TIMEZONE || "Africa/Lagos").trim().slice(0, 64),
  packname: String(process.env.PACKNAME || "VENOM MD BOT").trim().slice(0, 64),
  author: String(
    process.env.AUTHOR || "TAPRUSH EMP (Micheal)",
  )
    .trim()
    .slice(0, 64),
  sessionNamespace: namespace,
  sessionSite: safeUrl(
    process.env.SESSION_SITE_URL,
    "https://session-site-2odn.onrender.com",
  ),
  sessionDir: path.join(ROOT, "data", "sessions", namespace),
  channelUrl: safeUrl(
    process.env.CHANNEL_URL,
    "https://whatsapp.com/channel/0029Vb8bQew4dTnRwa7hlw2V",
  ),
  channelJid: String(process.env.CHANNEL_JID || "").trim(),
  community: Object.freeze({
    repo: "https://github.com/MykelGoal/VENOM-MD-BOT",
    youtube: "https://www.youtube.com/@venommdbot?sub_confirmation=1",
    telegram: "https://t.me/+PYae7FAKkbEwM2E0",
    group: "https://chat.whatsapp.com/CWpMOawc88e9DWGwfjW5Ia",
  }),
  databaseUrl: /^mongodb(?:\+srv)?:\/\//i.test(databaseUrl) ? databaseUrl : "",
  databaseName: String(process.env.MONGO_DB || "venom")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 48) || "venom",
  aiKeys: Object.freeze({
    gemini: String(process.env.GEMINI_API_KEY || process.env.GEMINI_API || "").trim(),
    openai: String(process.env.OPENAI_API_KEY || "").trim(),
    deepseek: String(process.env.DEEPSEEK_API_KEY || "").trim(),
    groq: String(process.env.GROQ_API_KEY || "").trim(),
    mistral: String(process.env.MISTRAL_API_KEY || "").trim(),
    openrouter: String(process.env.OPENROUTER_API_KEY || "").trim(),
    cerebras: String(process.env.CEREBRAS_API_KEY || "").trim(),
    cohere: String(process.env.COHERE_API_KEY || "").trim(),
  }),
  port: boundedInteger(process.env.PORT, 10_000, 1, 65_535),
  trustProxy: parseBoolean(process.env.TRUST_PROXY),
  autoRead: parseBoolean(process.env.AUTO_READ),
  autoReadStatus: parseBoolean(process.env.AUTO_READ_STATUS),
  alwaysOnline: parseBoolean(process.env.ALWAYS_ONLINE),
  rejectCalls: parseBoolean(process.env.REJECT_CALL, true),
  commandReact: parseBoolean(process.env.COMMAND_REACT, true),
  logLevel: String(process.env.LOG_LEVEL || "info").trim(),
  baileysLogLevel: String(process.env.BAILEYS_LOG_LEVEL || "silent").trim(),
  maxMediaBytes:
    boundedInteger(process.env.MEDIA_MAX_MB, 32, 5, 64) * 1024 * 1024,
});

export default config;

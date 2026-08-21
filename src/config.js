import "dotenv/config";

import { fileURLToPath } from "url";
import path from "path";
import BRAND from "../System/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["true", "1", "yes", "on", "enable"].includes(
    String(value).trim().toLowerCase(),
  );
};

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.replace(/[^0-9]/g, ""))
    .filter((item) => item.length >= 7 && item.length <= 15)
    .slice(0, 32);

const firstKey = (...values) => {
  for (const value of values) {
    const key = String(value || "")
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);
    if (key) return key;
  }
  return "";
};

const configuredOwners = list(process.env.MODS || process.env.OWNER_NUMBER);
const mongoUri =
  process.env.VENOM_TEST_ISOLATE === "1"
    ? ""
    : String(process.env.MONGODB || process.env.MONGO_URI || "").trim();

/**
 * Compatibility configuration for VENOM's original command collection.
 * Transport/authentication remain owned by the hardened root application.
 */
export const config = {
  botName: BRAND.botName,
  ownerName: BRAND.creator,
  ownerNumbers:
    configuredOwners.length > 0 ? configuredOwners : [BRAND.creatorNumber],
  userTag: process.env.USER_TAG || "USER",
  version: process.env.BOT_VERSION || "v4.1.0",
  platform: process.env.PLATFORM || "nodejs",
  prefix: process.env.PREFIX ?? ".",

  // The compatibility layer does not manage WhatsApp authentication itself.
  authMethod: "external",
  pairNumber: "",
  pairCustomCode: "",
  sessionStore: "external",
  sessionId: /^[a-zA-Z0-9_-]{1,64}$/.test(
    String(process.env.SESSION_NAMESPACE || process.env.SESSION_ID || "").trim(),
  )
    ? String(process.env.SESSION_NAMESPACE || process.env.SESSION_ID).trim()
    : "venom",
  sessionDir: path.join(ROOT, "System", "session"),

  botId: String(
    process.env.BOT_ID || configuredOwners[0] || BRAND.creatorNumber,
  )
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 32),

  mongoUri,
  mongoDb: String(process.env.MONGO_DB || "venom")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64) || "venom",
  sharedCluster: false,

  // The root Express server owns keep-alive/health handling.
  keepAlive: false,
  keepAlivePort: Number.parseInt(process.env.PORT || "10000", 10) || 10000,

  mode: (process.env.MODE || "public").toLowerCase(),
  autoRead: bool(process.env.AUTO_READ),
  autoReadStatus: bool(process.env.AUTO_READ_STATUS),
  autoTyping: bool(process.env.AUTO_TYPING),
  alwaysOnline: bool(process.env.ALWAYS_ONLINE),
  rejectCall: bool(process.env.REJECT_CALL),
  antiDelete: bool(process.env.ANTI_DELETE, true),
  startupMessage: bool(process.env.STARTUP_MESSAGE, true),
  cmdReact: bool(process.env.CMD_REACT, true),
  cmdReactEmoji: process.env.CMD_REACT_EMOJI || "⚡",
  autoDeleteCommands: bool(process.env.AUTO_DELETE_COMMANDS),

  // Off by default: deployments should never auto-add users to a group.
  forceJoin: bool(process.env.FORCE_JOIN, false),
  forceAutoAdd: bool(process.env.FORCE_AUTOADD, false),
  forceAutoAddHourly: Math.max(
    1,
    Number.parseInt(process.env.FORCE_AUTOADD_HOURLY || "20", 10) || 20,
  ),
  forceReAdd: bool(process.env.FORCE_READD, false),
  supportGroupLink: String(
    process.env.SUPPORT_GROUP_LINK || BRAND.supportGroup,
  ).trim(),
  menuImage: String(process.env.MENU_IMAGE || BRAND.logoPath).trim(),

  dlSource: (process.env.DL_SOURCE || "auto").toLowerCase(),
  dlProvider: (process.env.DL_PROVIDER || "auto").toLowerCase(),
  dbRetainDays: Number(process.env.DB_RETAIN_DAYS || 90),
  dbAutoClean: bool(process.env.DB_AUTOCLEAN, true),
  schoolReward: Number(process.env.SCHOOL_REWARD || 100),
  schoolGroup: String(process.env.SCHOOL_GROUP || "").trim(),
  affiliateUrl: String(process.env.AFFILIATE_URL || BRAND.repository).trim(),
  refReward: Number(process.env.REF_REWARD || 500),
  refBonus: Number(process.env.REF_BONUS || 250),
  refVipAt: Number(process.env.REF_VIP_AT || 5),

  keys: {
    openai: firstKey(process.env.OPENAI_API_KEY, process.env.OPENAI_API),
    gemini: firstKey(process.env.GEMINI_API_KEY, process.env.GEMINI_API),
    groq: firstKey(process.env.GROQ_API_KEY),
    pexels: firstKey(process.env.PEXELS_KEY),
    pixabay: firstKey(process.env.PIXABAY_KEY, process.env.PIXABAY_API_KEY),
    weather: firstKey(
      process.env.OPENWEATHER_KEY,
      process.env.OPENWEATHER_API_KEY,
    ),
  },

  pluginDir: path.join(ROOT, "plugins"),
  tmpDir: path.join(ROOT, "tmp"),
  startTime: Date.now(),
};

export function prefixes() {
  const prefix = config.prefix;
  if (prefix === "none" || prefix === "") return [""];
  if (prefix === "multi") return [".", "/", "!", "#", "$", ","];
  return [prefix];
}

export default config;

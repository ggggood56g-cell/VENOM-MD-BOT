import dotenv from "dotenv";
import BRAND from "./System/Branding.js";

dotenv.config();

const envValue = (name, fallback = "", maximumLength = 1024) => {
  const value = String(process.env[name] ?? fallback).trim();
  return (value || fallback).slice(0, maximumLength);
};

export const parsePhoneNumbers = (value) =>
  [
    ...new Set(
      String(value || "")
        .split(",")
        .map((item) => item.replace(/[^0-9]/g, ""))
        .filter((item) => item.length >= 7 && item.length <= 15),
    ),
  ].slice(0, 32);

export const parseProviderKeys = (value) =>
  String(value || "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0 && key.length <= 512)
    .slice(0, 32);

export const parsePrefix = (value) => {
  const prefix = String(value || "").trim();
  return /^\S{1,8}$/u.test(prefix) ? prefix : ".";
};

export const parseSessionId = (value) => {
  const sessionId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(sessionId) ? sessionId : "venom";
};

const configuredSessionId = String(process.env.SESSION_ID || "").trim();
const explicitSessionCredential = String(
  process.env.SESSION_CREDENTIAL || "",
).trim();
let pendingSessionCredential =
  explicitSessionCredential ||
  (/^[a-zA-Z0-9_-]{1,64}$/.test(configuredSessionId)
    ? ""
    : configuredSessionId);

// Consume credentials once and remove them from process.env so plugins and
// diagnostics cannot accidentally print a linked WhatsApp session secret.
export const consumeSessionCredential = () => {
  const credential = pendingSessionCredential;
  pendingSessionCredential = "";
  return credential;
};

if (explicitSessionCredential) delete process.env.SESSION_CREDENTIAL;
if (pendingSessionCredential && configuredSessionId === pendingSessionCredential) {
  delete process.env.SESSION_ID;
}

export const LOCAL_MONGO_URI = "mongodb://127.0.0.1:27017/venom";

export const isMongoUri = (value) =>
  /^mongodb(?:\+srv)?:\/\//i.test(String(value || "").trim());

export const isLocalMongoUri = (value) => {
  const uri = String(value || "").trim();
  if (!isMongoUri(uri)) return false;
  try {
    const hostname = new URL(uri).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.")
    );
  } catch {
    return false;
  }
};

/**
 * Return the first valid MongoDB URI from the supplied candidates. MONGODB is
 * the documented name, while MONGO_URI is accepted for hosts and templates
 * that use the more common convention.
 */
export const configuredMongoUri = (...values) => {
  for (const value of values.flat()) {
    const uri = String(value || "").trim();
    if (isMongoUri(uri)) return uri.slice(0, 2048);
  }
  return "";
};

/**
 * Keep a localhost default for development, but never silently point a
 * production deployment at its own container. Render and similar hosts do
 * not run MongoDB at 127.0.0.1:27017.
 */
export const resolveMongoUri = (values, { production = false } = {}) => {
  const candidates = Array.isArray(values) ? values : [values];
  const configured = configuredMongoUri(
    ...(production
      ? candidates.filter((candidate) => !isLocalMongoUri(candidate))
      : candidates),
  );
  return configured || (production ? "" : LOCAL_MONGO_URI);
};

// Retain the original development-friendly helper for compatibility.
export const parseMongoUri = (value) =>
  resolveMongoUri(value, { production: false });

global.pickKey = (keys) => {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
};

// Public creator credit is permanent. MODS controls deployment administration only.
global.brand = BRAND;
global.creatorName = BRAND.creator;
global.creatorNumber = BRAND.creatorNumber;
global.botName = BRAND.botName;
global.suppL = BRAND.supportGroup;

global.owner = parsePhoneNumbers(process.env.MODS);
if (global.owner.length === 0) global.owner = [BRAND.creatorNumber];

const mongoCandidates = [process.env.MONGODB, process.env.MONGO_URI];
const isProduction =
  String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

// MONGODB is canonical; MONGO_URI keeps existing deployments compatible.
// In production, an omitted/invalid/local value remains empty so the optional
// database layer can choose local JSON storage instead of retrying localhost.
global.mongodb = resolveMongoUri(mongoCandidates, { production: isProduction });
global.mongoConfigured =
  Boolean(global.mongodb) && Boolean(configuredMongoUri(...mongoCandidates));
global.sessionId = parseSessionId(
  process.env.SESSION_NAMESPACE ||
    (/^[a-zA-Z0-9_-]{1,64}$/.test(configuredSessionId)
      ? configuredSessionId
      : "venom"),
);
global.prefa = parsePrefix(process.env.PREFIX);
global.packname = envValue("PACKNAME", BRAND.botName, 128);
global.author = envValue("AUTHOR", `by: ${BRAND.creator}`, 128);
global.port = envValue("PORT", "10000", 5);

global.geminiAPIKeys = parseProviderKeys(process.env.GEMINI_API);
global.openAiAPIKeys = parseProviderKeys(process.env.OPENAI_API);
global.claudeAPIKeys = parseProviderKeys(process.env.CLAUDE_API);
global.tenorAPIKeys = parseProviderKeys(process.env.TENOR_API_KEY);
global.tiktokAPIKeys = parseProviderKeys(process.env.TIKTOK_API_KEY);

Object.defineProperty(global, "tenorApiKey", {
  get() {
    return global.pickKey(global.tenorAPIKeys);
  },
  configurable: true,
});

export default {
  mongodb: global.mongodb,
};

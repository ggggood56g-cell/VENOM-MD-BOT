import { consumeSessionCredential } from "./Configurations.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import mongoose from "mongoose";
import pino from "pino";
import ffmpegStatic from "ffmpeg-static";
import { fileTypeFromBuffer } from "file-type";
import {
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  getContentType,
  jidDecode,
  jidNormalizedUser,
  makeWASocket,
} from "baileys";

import BRAND from "./System/Branding.js";
import MongoAuth from "./System/MongoAuth/MongoAuth.js";
import { serialize } from "./System/whatsapp.js";
import { readcommands, commands } from "./System/ReadCommands.js";
import core from "./Core.js";
import { protectSocketMedia } from "./System/SafeMedia.js";
import {
  activateLegacySocket,
  dispatchLegacyGroupUpdate,
  dispatchLegacyMessage,
  dispatchLegacyMessageUpdates,
  handleLegacyCalls,
  initializeLegacyCommands,
  invalidateLegacyGroupMetadata,
  legacyCommandFor,
  legacyRegistryStats,
  shutdownLegacyCommands,
} from "./System/LegacyCommands.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
);

if (
  !process.env.FFMPEG_PATH &&
  ffmpegStatic &&
  fs.existsSync(ffmpegStatic)
) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}
global.botVersion = packageJson.version;
global.latestVersion = packageJson.version;
global.updateAvailable = false;
global.lidToJidMap = new Map();
global.cacheLidMapping = (first, second) => {
  if (!first || !second) return;
  global.lidToJidMap.delete(first);
  global.lidToJidMap.set(first, second);
  while (global.lidToJidMap.size > CONTACT_CACHE_MAX * 2) {
    global.lidToJidMap.delete(global.lidToJidMap.keys().next().value);
  }
};
commands.prefix = global.prefa;

await fs.promises.mkdir(path.join(__dirname, "System", "Cache"), {
  recursive: true,
});

const asBoundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const MESSAGE_CACHE_TTL_MS =
  asBoundedInteger(process.env.MESSAGE_CACHE_TTL_MINUTES, 360, 30, 1440) *
  60_000;
const MESSAGE_CACHE_MAX_PER_CHAT = asBoundedInteger(
  process.env.MESSAGE_CACHE_MAX_PER_CHAT,
  500,
  50,
  2000,
);
const CONTACT_CACHE_MAX = asBoundedInteger(
  process.env.CONTACT_CACHE_MAX,
  10_000,
  1_000,
  50_000,
);
const MAX_MEDIA_BYTES =
  asBoundedInteger(process.env.MEDIA_MAX_MB, 50, 5, 100) * 1024 * 1024;
const WATCHDOG_INTERVAL_MS =
  asBoundedInteger(process.env.WATCHDOG_INTERVAL_SECONDS, 60, 30, 600) * 1000;
const GC_INTERVAL_MS =
  asBoundedInteger(process.env.GC_INTERVAL_MINUTES, 30, 1, 1440) * 60_000;
const CONNECT_STALL_MS = 180_000;
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

class MessageCache {
  constructor() {
    this.chats = new Map();
    this.contacts = new Map();
  }

  bind(events) {
    events.on("messages.upsert", ({ messages = [] }) => {
      for (const message of messages) this.put(message);
    });
    events.on("contacts.upsert", (contacts = []) => {
      for (const contact of contacts) this.updateContact(contact);
    });
    events.on("contacts.update", (contacts = []) => {
      for (const contact of contacts) this.updateContact(contact);
    });
  }

  updateContact(contact) {
    if (!contact?.id) return;
    const previous = this.contacts.get(contact.id) || {};
    const merged = { ...previous, ...contact };
    this.contacts.delete(contact.id);
    this.contacts.set(contact.id, merged);
    while (this.contacts.size > CONTACT_CACHE_MAX) {
      this.contacts.delete(this.contacts.keys().next().value);
    }

    const phoneJid = merged.id?.endsWith("@s.whatsapp.net")
      ? merged.id
      : merged.phoneNumber?.endsWith("@s.whatsapp.net")
        ? merged.phoneNumber
        : null;
    const lidJid = merged.id?.endsWith("@lid")
      ? merged.id
      : merged.lid?.endsWith("@lid")
        ? merged.lid
        : null;
    if (phoneJid && lidJid) {
      global.cacheLidMapping(phoneJid, lidJid);
      global.cacheLidMapping(lidJid, phoneJid);
    }
  }

  put(message) {
    const jid = message?.key?.remoteJid;
    const id = message?.key?.id;
    if (!jid || !id) return;

    const chat = this.chats.get(jid) || new Map();
    chat.delete(id);
    chat.set(id, { message, cachedAt: Date.now() });
    while (chat.size > MESSAGE_CACHE_MAX_PER_CHAT) {
      chat.delete(chat.keys().next().value);
    }
    this.chats.set(jid, chat);
  }

  get(jid, id) {
    const item = this.chats.get(jid)?.get(id);
    if (!item) return undefined;
    if (Date.now() - item.cachedAt > MESSAGE_CACHE_TTL_MS) {
      this.chats.get(jid)?.delete(id);
      return undefined;
    }
    return item.message;
  }

  prune(now = Date.now()) {
    for (const [jid, chat] of this.chats) {
      for (const [id, item] of chat) {
        if (now - item.cachedAt > MESSAGE_CACHE_TTL_MS) chat.delete(id);
      }
      if (chat.size === 0) this.chats.delete(jid);
    }
  }
}

const messageCache = new MessageCache();
let pendingSessionCredential = consumeSessionCredential();

const runtime = {
  status: "initializing",
  startedAt: Date.now(),
  connectedAt: null,
  lastConnectionUpdateAt: Date.now(),
  reconnectAttempt: 0,
  error: null,
  socket: null,
  mongoAuth: null,
  clearAuthState: null,
  generation: 0,
  socketStartedAt: 0,
  reconnectTimer: null,
  startPromise: null,
  syncPromise: null,
  credsSavePromise: null,
  shuttingDown: false,
};

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use((request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  if (request.path.startsWith("/api/")) {
    response.set("Cache-Control", "no-store");
  }
  next();
});

const rateLimitBuckets = new Map();
const rateLimit = ({ windowMs, max }) => (request, response, next) => {
  const key = `${request.ip}:${request.route?.path || request.path}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  bucket.count += 1;
  response.set("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
  if (bucket.count > max) {
    response.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return response.status(429).json({ error: "Too many requests. Try again later." });
  }
  return next();
};

const socketIsOpen = (socket = runtime.socket) =>
  Boolean(socket && (socket.ws?.isOpen === true || socket.ws?.readyState === 1));

const isCurrentSocket = (socket, generation) =>
  runtime.socket === socket && runtime.generation === generation;

const disconnectReasonName = (code) =>
  Object.entries(DisconnectReason).find(([, value]) => value === code)?.[0] ||
  `unknown (${code ?? "no code"})`;

const getDisconnectCode = (error) =>
  error?.output?.statusCode ??
  error?.data?.statusCode ??
  error?.statusCode ??
  error?.cause?.output?.statusCode;

const closeActiveSocket = async (reason) => {
  const socket = runtime.socket;
  if (!socket) return;

  runtime.socket = null;
  runtime.generation += 1;
  runtime.socketStartedAt = 0;
  try {
    await Promise.race([
      Promise.resolve(socket.end?.(new Error(reason))),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    try {
      socket.ws?.close?.();
    } catch {
      // Socket is already gone.
    }
  }
};

const reconnectDelay = () => {
  const base = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** Math.max(0, runtime.reconnectAttempt - 1),
  );
  return base + Math.floor(base * 0.2 * Math.random());
};

const scheduleReconnect = (reason, { clearAuth = false, immediate = false } = {}) => {
  if (runtime.shuttingDown || runtime.reconnectTimer) return;

  runtime.reconnectAttempt += 1;
  runtime.status = "reconnecting";
  runtime.error = reason;
  const delay = immediate ? 250 : reconnectDelay();
  console.warn(
    `[ VENOM ] Reconnecting in ${(delay / 1000).toFixed(1)}s ` +
      `(attempt ${runtime.reconnectAttempt}): ${reason}`,
  );

  runtime.reconnectTimer = setTimeout(async () => {
    runtime.reconnectTimer = null;
    try {
      await closeActiveSocket(`Reconnect: ${reason}`);
      if (clearAuth && runtime.clearAuthState) {
        await runtime.clearAuthState();
        runtime.clearAuthState = null;
        runtime.mongoAuth = null;
      }
      await startVenom(`reconnect: ${reason}`);
    } catch (error) {
      console.error(`[ VENOM ] Reconnect failed: ${error.message}`);
      scheduleReconnect(error.message, { clearAuth });
    }
  }, delay);
  runtime.reconnectTimer.unref?.();
};

const ensureMongo = async () => {
  if (mongoose.connection.readyState === 1) return;
  runtime.status = "database";
  await mongoose.connect(global.mongodb, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });
  console.log("[ VENOM ] MongoDB connected ✓");
};

const loadBuffer = async (input) => {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input !== "string") throw new TypeError("Unsupported file input.");
  if (/^data:.*?;base64,/i.test(input)) {
    return Buffer.from(input.slice(input.indexOf(",") + 1), "base64");
  }
  const resolved = path.resolve(__dirname, input);
  const relative = path.relative(__dirname, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("File path must stay inside the bot directory.");
  }
  return fs.promises.readFile(resolved);
};

const rawMediaType = (message) => {
  const type = message?.mtype || message?.type || getContentType(message?.message || {});
  const normalized = String(type || "").replace(/Message$/i, "").toLowerCase();
  if (["image", "video", "audio", "sticker", "document"].includes(normalized)) {
    return normalized;
  }
  return String(message?.mimetype || "application/octet-stream").split("/")[0];
};

const attachSocketHelpers = (socket) => {
  socket.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/i.test(jid)) {
      const decoded = jidDecode(jid) || {};
      if (decoded.user && decoded.server) return `${decoded.user}@${decoded.server}`;
    }
    return jid;
  };

  socket.sendText = (jid, text, quoted = undefined, options = {}) =>
    socket.sendMessage(jid, { text: String(text), ...options }, { quoted });

  socket.setStatus = (text) => {
    void socket.updateProfileStatus?.(String(text)).catch(() => {});
    return text;
  };

  socket.parseMention = (text = "") =>
    [...String(text).matchAll(/@([0-9]{5,16}|0)/g)].map(
      (match) => `${match[1]}@s.whatsapp.net`,
    );

  socket.downloadMediaMessage = async (message) => {
    const content = message?.msg || message;
    const stream = await downloadContentFromMessage(content, rawMediaType(message));
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_MEDIA_BYTES) {
        stream.destroy?.();
        throw new Error(
          `Media exceeds the configured ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)} MB limit.`,
        );
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, totalBytes);
  };

  socket.downloadAndSaveMediaMessage = async (
    message,
    filename,
    attachExtension = true,
  ) => {
    const buffer = await socket.downloadMediaMessage(message);
    const detected = await fileTypeFromBuffer(buffer);
    const baseName = filename
      ? path.resolve(__dirname, filename)
      : path.join(
          __dirname,
          "System",
          "Cache",
          `${Date.now()}-${randomBytes(8).toString("hex")}`,
        );
    const relative = path.relative(__dirname, baseName);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Media output path must stay inside the bot directory.");
    }
    const output = attachExtension
      ? `${baseName}.${detected?.ext || "bin"}`
      : baseName;
    await fs.promises.mkdir(path.dirname(output), { recursive: true });
    await fs.promises.writeFile(output, buffer, { mode: 0o600 });
    return output;
  };

  socket.sendFile = async (
    jid,
    input,
    fileName = "file",
    quoted = undefined,
    options = {},
  ) => {
    const buffer = await loadBuffer(input);
    const detected = await fileTypeFromBuffer(buffer);
    const mime = detected?.mime || "application/octet-stream";
    const { asDocument = false, ...messageOptions } = options;
    const type = asDocument
      ? "document"
      : mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "document";
    return socket.sendMessage(
      jid,
      { [type]: buffer, mimetype: mime, fileName, ...messageOptions },
      { quoted },
    );
  };
};

const routingBody = (message) => {
  const type = message?.type;
  if (type === "buttonsResponseMessage") {
    return message.message?.[type]?.selectedButtonId || message.body || "";
  }
  if (type === "listResponseMessage") {
    return message.message?.[type]?.singleSelectReply?.selectedRowId || message.body || "";
  }
  if (type === "templateButtonReplyMessage") {
    return message.message?.[type]?.selectedId || message.body || "";
  }
  return message?.body || message?.text || "";
};

const atlasPrefixedCommand = (body) => {
  const prefix = String(commands.prefix || global.prefa || ".");
  if (!String(body || "").startsWith(prefix)) return "";
  return String(body).slice(prefix.length).trim().split(/\s+/, 1)[0]?.toLowerCase() || "";
};

const connectVenom = async (trigger) => {
  runtime.status = "connecting";
  runtime.error = null;
  runtime.lastConnectionUpdateAt = Date.now();
  console.log(`[ VENOM ] Starting ${BRAND.botName} (${trigger})...`);

  await ensureMongo();
  await initializeLegacyCommands();
  if (runtime.shuttingDown) return null;

  const credential = pendingSessionCredential;
  pendingSessionCredential = "";
  const mongoAuth = new MongoAuth(global.sessionId, { credential });
  const { state, saveCreds, clearState } = await mongoAuth.init();
  if (runtime.shuttingDown) return null;

  runtime.mongoAuth = mongoAuth;
  runtime.clearAuthState = clearState;

  let version;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch (error) {
    console.warn(`[ VENOM ] Could not fetch the latest WA version: ${error.message}`);
  }
  if (runtime.shuttingDown) return null;

  const generation = ++runtime.generation;
  const socket = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    browser: [BRAND.botName, "Chrome", packageJson.version],
    logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || "silent" }),
    printQRInTerminal: false,
    keepAliveIntervalMs: 25_000,
    // Avoid unguarded server-side URL fetches while preparing link previews.
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => messageCache.get(key.remoteJid, key.id)?.message,
  });

  runtime.socket = socket;
  runtime.socketStartedAt = Date.now();
  runtime.lastConnectionUpdateAt = Date.now();
  protectSocketMedia(socket);
  attachSocketHelpers(socket);
  messageCache.bind(socket.ev);
  await readcommands();

  let credsSaveQueue = Promise.resolve();
  socket.ev.on("creds.update", () => {
    credsSaveQueue = credsSaveQueue
      .then(() => saveCreds())
      .catch((error) =>
        console.error(`[ VENOM ] Credential save failed: ${error.message}`),
      );
    runtime.credsSavePromise = credsSaveQueue;
  });
  socket.ev.on("connection.update", async (update) => {
    if (!isCurrentSocket(socket, generation)) return;
    runtime.lastConnectionUpdateAt = Date.now();
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      runtime.status = "awaiting-session";
      runtime.error =
        "No stored WhatsApp session is available. Generate one with VENOM's external session site.";
    }

    if (connection === "open") {
      runtime.status = "open";
      runtime.connectedAt = Date.now();
      runtime.reconnectAttempt = 0;
      runtime.error = null;
      activateLegacySocket(socket);
      const legacyStats = legacyRegistryStats();
      console.log(`[ VENOM ] ${BRAND.botName} connected ✓`);
      console.log(
        `[ VENOM ] ${legacyStats.commandObjects} original commands (${legacyStats.routableKeys} names/aliases) ready`,
      );
      return;
    }

    if (connection !== "close") return;
    const code = getDisconnectCode(lastDisconnect?.error);
    const reason = disconnectReasonName(code);
    runtime.socket = null;
    runtime.connectedAt = null;
    console.warn(`[ VENOM ] WhatsApp connection closed: ${reason}`);

    if (code === DisconnectReason.connectionReplaced) {
      runtime.status = "error";
      runtime.error = "Connection replaced by another session. Stop the other instance before restarting.";
      return;
    }

    const clearAuth =
      code === DisconnectReason.badSession || code === DisconnectReason.loggedOut;
    scheduleReconnect(`WhatsApp disconnected: ${reason}`, {
      clearAuth,
      immediate: code === DisconnectReason.restartRequired,
    });
  });

  socket.ev.on("groups.update", (events = []) => {
    if (!isCurrentSocket(socket, generation)) return;
    for (const event of events) invalidateLegacyGroupMetadata(event?.id);
  });

  socket.ev.on("group-participants.update", (event) => {
    if (!isCurrentSocket(socket, generation)) return;
    void dispatchLegacyGroupUpdate(socket, event);
  });

  socket.ev.on("messages.upsert", (chatUpdate) => {
    if (!isCurrentSocket(socket, generation) || chatUpdate.type !== "notify") return;
    for (const rawMessage of chatUpdate.messages || []) {
      const message = serialize(socket, rawMessage);
      if (!message?.message) continue;
      if (message.key?.id?.startsWith("BAE5") && message.key.id.length === 16) continue;

      const body = routingBody(message);
      const legacy = legacyCommandFor(body);
      const atlasCommand = legacy ? "" : atlasPrefixedCommand(body);

      void (async () => {
        const routing = await dispatchLegacyMessage(socket, rawMessage, {
          externalCommand: atlasCommand,
        });
        // The original VENOM catalogue has precedence. Atlas is retained only
        // as a compatibility fallback for names absent from that registry.
        if (
          atlasCommand &&
          !routing.blocked &&
          message.key?.remoteJid !== "status@broadcast"
        ) {
          await core(socket, message, commands, chatUpdate);
        }
      })().catch((error) =>
        console.error(
          `[ VENOM ] Message handler failed: ${error.stack || error.message}`,
        ),
      );
    }
  });

  socket.ev.on("messages.update", (updates) => {
    if (isCurrentSocket(socket, generation)) {
      void dispatchLegacyMessageUpdates(socket, updates);
    }
  });

  socket.ev.on("call", (calls) => {
    if (isCurrentSocket(socket, generation)) {
      void handleLegacyCalls(socket, calls);
    }
  });

  return socket;
};

async function startVenom(trigger = "initial") {
  if (runtime.shuttingDown) return null;
  if (runtime.startPromise) return runtime.startPromise;
  if (runtime.socket && runtime.status === "open") return runtime.socket;

  runtime.startPromise = connectVenom(trigger)
    .catch((error) => {
      runtime.status = "error";
      runtime.error = error.message;
      console.error(`[ VENOM ] Startup failed: ${error.stack || error.message}`);
      scheduleReconnect(`startup failed: ${error.message}`);
      return null;
    })
    .finally(() => {
      runtime.startPromise = null;
    });
  return runtime.startPromise;
}

const runPeriodicSync = async ({ force = false } = {}) => {
  if (!runtime.mongoAuth || runtime.syncPromise || (runtime.shuttingDown && !force)) {
    return runtime.syncPromise;
  }
  runtime.syncPromise = runtime.mongoAuth
    .pushToMongoDB()
    .catch((error) =>
      console.error(`[ VENOM ] Session backup failed: ${error.message}`),
    )
    .finally(() => {
      runtime.syncPromise = null;
    });
  return runtime.syncPromise;
};

const watchdogTimer = setInterval(() => {
  messageCache.prune();
  if (runtime.shuttingDown || runtime.reconnectTimer || runtime.startPromise) return;
  if (!runtime.socket) {
    scheduleReconnect("watchdog found no active socket");
    return;
  }
  if (
    runtime.status === "connecting" &&
    Date.now() - runtime.socketStartedAt > CONNECT_STALL_MS
  ) {
    scheduleReconnect("WhatsApp connection timed out", { immediate: true });
    return;
  }
  if (runtime.status === "open" && !socketIsOpen()) {
    scheduleReconnect("watchdog found a closed WebSocket", { immediate: true });
  }
}, WATCHDOG_INTERVAL_MS);
watchdogTimer.unref?.();

const maintenanceTimer = setInterval(() => {
  if (typeof global.gc === "function") global.gc();
  void runPeriodicSync();
}, GC_INTERVAL_MS);
maintenanceTimer.unref?.();

const cleanupRateLimitsTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 60_000);
cleanupRateLimitsTimer.unref?.();

app.get(
  "/api/status",
  rateLimit({ windowMs: 60_000, max: 120 }),
  (_request, response) => {
    response.json({
      status: runtime.status,
      websocketOpen: socketIsOpen(),
      reconnectAttempt: runtime.reconnectAttempt,
      startedAt: new Date(runtime.startedAt).toISOString(),
      connectedAt: runtime.connectedAt
        ? new Date(runtime.connectedAt).toISOString()
        : null,
      lastConnectionUpdate: new Date(
        runtime.lastConnectionUpdateAt,
      ).toISOString(),
      error:
        runtime.status === "error" || runtime.status === "awaiting-session"
          ? runtime.error
          : null,
    });
  },
);

app.get(
  "/",
  rateLimit({ windowMs: 60_000, max: 120 }),
  (_request, response) => {
    response.type("text/plain").send(`${BRAND.botName} is running.`);
  },
);

app.use((error, _request, response, _next) => {
  console.error(`[ VENOM ] HTTP error: ${error.stack || error.message}`);
  return response.status(500).json({ error: "Internal server error." });
});

const port = asBoundedInteger(global.port, 10000, 1, 65535);
const httpServer = app.listen(port, "0.0.0.0", () => {
  console.log(`[ VENOM ] Health server listening on 0.0.0.0:${port}`);
});

const shutdown = async (signal) => {
  if (runtime.shuttingDown) return;
  runtime.shuttingDown = true;
  runtime.status = "stopping";
  console.log(`[ VENOM ] ${signal} received; shutting down...`);
  if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
  clearInterval(watchdogTimer);
  clearInterval(maintenanceTimer);
  clearInterval(cleanupRateLimitsTimer);

  const httpClosePromise = new Promise((resolve) => httpServer.close(resolve));
  httpServer.closeIdleConnections?.();

  if (runtime.startPromise) {
    await Promise.race([
      runtime.startPromise,
      new Promise((resolve) => setTimeout(resolve, 12_000)),
    ]);
  }
  await closeActiveSocket(`Shutdown: ${signal}`);
  if (runtime.credsSavePromise) {
    await Promise.race([
      runtime.credsSavePromise,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  await Promise.race([
    runPeriodicSync({ force: true }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await shutdownLegacyCommands().catch((error) =>
    console.warn(`[ VENOM ] Legacy data shutdown failed: ${error.message}`),
  );
  await mongoose.disconnect().catch(() => {});
  await Promise.race([
    httpClosePromise,
    new Promise((resolve) =>
      setTimeout(() => {
        httpServer.closeAllConnections?.();
        resolve();
      }, 5000),
    ),
  ]);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  console.error(`[ VENOM ] Unhandled rejection: ${error?.stack || error}`);
});

console.log(
  `[ VENOM ] ${BRAND.botName} v${packageJson.version} | Node ${process.version}`,
);
void startVenom();

import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
} from "baileys";

import { baileysLogger, logger, safeError } from "./logger.js";
import { messageDetails } from "./message.js";
import plugins from "./plugins/index.js";
import CommandRouter from "./router.js";
import AiService from "./services/ai.js";
import { formatDuration, jidNumber, sleep } from "./utils.js";

function disconnectCode(error) {
  return (
    error?.output?.statusCode ??
    error?.data?.statusCode ??
    error?.statusCode ??
    error?.cause?.output?.statusCode
  );
}

function reasonName(code) {
  return (
    Object.entries(DisconnectReason).find(([, value]) => value === code)?.[0] ||
    `unknown-${code ?? "none"}`
  );
}

export default class VenomBot {
  constructor({ config, database, authStore, stateStore, requestRestart }) {
    this.config = config;
    this.database = database;
    this.authStore = authStore;
    this.stateStore = stateStore;
    this.socket = null;
    this.auth = null;
    this.saveCreds = null;
    this.generation = 0;
    this.reconnectTimer = null;
    this.shuttingDown = false;
    this.startedAt = Date.now();
    this.connectedAt = null;
    this.lastUpdateAt = Date.now();
    this.reconnectAttempt = 0;
    this.status = "initializing";
    this.error = null;
    this.router = new CommandRouter({
      config,
      store: stateStore,
      runtime: this,
      ai: new AiService(config.geminiKey),
      requestRestart,
    });
    this.router.register(plugins);
  }

  async start() {
    try {
      const initialized = await this.authStore.init();
      this.auth = initialized.state;
      this.saveCreds = initialized.saveCreds;
      if (!initialized.linked) {
        this.status = "awaiting-session";
        this.error = `Add SESSION_ID from ${this.config.sessionSite}, then restart.`;
        return;
      }
      await this.connect("initial startup");
    } catch (error) {
      this.status = "error";
      this.error = safeError(error);
      logger.error({ error: safeError(error) }, "Bot startup failed");
    }
  }

  async connect(trigger) {
    if (this.shuttingDown || !this.auth?.creds?.registered) return;
    this.status = "connecting";
    this.error = null;
    this.lastUpdateAt = Date.now();
    logger.info({ trigger }, "Starting WhatsApp connection");

    let version;
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch (error) {
      logger.warn({ error: safeError(error) }, "Could not fetch latest WhatsApp version");
    }

    const generation = ++this.generation;
    const socket = makeWASocket({
      ...(version ? { version } : {}),
      auth: {
        creds: this.auth.creds,
        keys: makeCacheableSignalKeyStore(this.auth.keys, baileysLogger),
      },
      browser: Browsers.ubuntu("Chrome"),
      logger: baileysLogger,
      markOnlineOnConnect: this.config.alwaysOnline,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 25_000,
      getMessage: async () => undefined,
    });
    socket.logger = baileysLogger;
    this.socket = socket;

    socket.ev.on("creds.update", () => {
      void this.saveCreds().catch((error) =>
        logger.error({ error: safeError(error) }, "Could not save session credentials"),
      );
    });

    socket.ev.on("connection.update", (update) => {
      void this.onConnectionUpdate(socket, generation, update);
    });

    socket.ev.on("messages.upsert", (update) => {
      void this.onMessages(socket, generation, update);
    });

    socket.ev.on("group-participants.update", (update) => {
      void this.onGroupParticipants(socket, generation, update);
    });

    socket.ev.on("call", (calls) => {
      void this.onCalls(socket, generation, calls);
    });
  }

  async onConnectionUpdate(socket, generation, update) {
    if (!this.isCurrent(socket, generation)) return;
    this.lastUpdateAt = Date.now();

    if (update.qr) {
      this.status = "awaiting-session";
      this.error = `Stored credentials are no longer linked. Generate a new SESSION_ID at ${this.config.sessionSite}.`;
      logger.warn("WhatsApp requested pairing; stopping because pairing belongs to the external session site");
      await this.closeSocket("Unlinked session");
      return;
    }

    if (update.connection === "open") {
      this.status = "open";
      this.error = null;
      this.connectedAt = Date.now();
      this.reconnectAttempt = 0;
      logger.info(
        { user: jidNumber(socket.user?.id), commands: this.router.list().length },
        `${this.config.botName} connected`,
      );
      return;
    }

    if (update.connection !== "close") return;
    const code = disconnectCode(update.lastDisconnect?.error);
    const reason = reasonName(code);
    this.socket = null;
    this.connectedAt = null;
    logger.warn({ code, reason }, "WhatsApp connection closed");
    if (this.shuttingDown) return;

    const terminal = new Set([
      DisconnectReason.badSession,
      DisconnectReason.loggedOut,
      DisconnectReason.connectionReplaced,
      DisconnectReason.multideviceMismatch,
      DisconnectReason.forbidden,
    ]);
    if (terminal.has(code)) {
      this.status = code === DisconnectReason.loggedOut ? "logged-out" : "error";
      this.error = `WhatsApp stopped the session: ${reason}. Generate a fresh SESSION_ID if needed.`;
      return;
    }

    this.scheduleReconnect(reason, code === DisconnectReason.restartRequired ? 500 : null);
  }

  async onMessages(socket, generation, update) {
    if (!this.isCurrent(socket, generation) || update.type !== "notify") return;
    for (const raw of update.messages || []) {
      if (!raw?.message) continue;
      const details = messageDetails(raw);
      if (details.isStatus) {
        if (this.config.autoReadStatus) await socket.readMessages([raw.key]).catch(() => {});
        continue;
      }
      if (this.config.autoRead) await socket.readMessages([raw.key]).catch(() => {});
      await this.router.handle(socket, details).catch((error) =>
        logger.error({ error: safeError(error) }, "Message routing failed"),
      );
    }
  }

  async onGroupParticipants(socket, generation, update) {
    if (!this.isCurrent(socket, generation)) return;
    const settings = this.stateStore.group(update.id);
    const key = update.action === "add" ? "welcome" : update.action === "remove" ? "goodbye" : null;
    if (!key || !settings[key]) return;

    let subject = "the group";
    try {
      subject = (await socket.groupMetadata(update.id)).subject || subject;
    } catch {
      // A text fallback still works if metadata is temporarily unavailable.
    }
    const template = key === "welcome" ? settings.welcomeText : settings.goodbyeText;
    for (const participant of update.participants || []) {
      const text = template
        .replaceAll("{group}", subject)
        .replaceAll("@user", `@${jidNumber(participant)}`);
      await socket.sendMessage(update.id, { text, mentions: [participant] }).catch(() => {});
    }
  }

  async onCalls(socket, generation, calls) {
    if (!this.isCurrent(socket, generation) || !this.config.rejectCalls) return;
    for (const call of calls || []) {
      if (call.status !== "offer") continue;
      await socket.rejectCall(call.id, call.from).catch(() => {});
      await socket
        .sendMessage(call.from, {
          text: `📵 ${this.config.botName} does not accept calls. Please send a message instead.`,
        })
        .catch(() => {});
    }
  }

  scheduleReconnect(reason, fixedDelay = null) {
    if (this.shuttingDown || this.reconnectTimer || this.status === "awaiting-session") return;
    this.reconnectAttempt += 1;
    const base = Math.min(60_000, 2_000 * 2 ** Math.min(this.reconnectAttempt - 1, 5));
    const delay = fixedDelay ?? base + Math.floor(Math.random() * 1_000);
    this.status = "reconnecting";
    this.error = null;
    logger.info({ reason, attempt: this.reconnectAttempt, delay }, "Reconnect scheduled");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(`reconnect after ${reason}`).catch((error) => {
        logger.error({ error: safeError(error) }, "Reconnect failed");
        this.scheduleReconnect(safeError(error));
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  isCurrent(socket, generation) {
    return this.socket === socket && this.generation === generation;
  }

  async closeSocket(reason) {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    this.generation += 1;
    try {
      await Promise.race([Promise.resolve(socket.end?.(new Error(reason))), sleep(3_000)]);
    } catch {
      socket.ws?.close?.();
    }
  }

  publicStatus() {
    return {
      name: this.config.botName,
      status: this.status,
      connected: this.status === "open",
      database: this.database.status,
      mode: this.stateStore.mode,
      prefix: this.stateStore.prefix,
      commands: this.router.list().length,
      uptime: formatDuration((Date.now() - this.startedAt) / 1_000),
      startedAt: new Date(this.startedAt).toISOString(),
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
      reconnectAttempt: this.reconnectAttempt,
      error: ["error", "logged-out", "awaiting-session"].includes(this.status)
        ? this.error
        : null,
    };
  }

  async stop() {
    this.shuttingDown = true;
    this.status = "stopping";
    clearTimeout(this.reconnectTimer);
    await this.closeSocket("Bot shutting down");
    await this.authStore.close();
    await this.stateStore.close();
  }
}

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
import { channelChip, resolveChannelJid } from "./services/channel.js";
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
  constructor({ config, database, authStore, stateStore, requestRestart, requestShutdown }) {
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
    this.messageCount = 0;
    this.deletedLog = new Map();
    this.editLog = new Map();
    this.recentLog = new Map();
    this.presenceLog = new Map();
    this.statusLog = new Map();
    this.reminderTimer = setInterval(() => void this.deliverReminders(), 15_000);
    this.reminderTimer.unref?.();
    this.router = new CommandRouter({
      config,
      store: stateStore,
      runtime: this,
      ai: new AiService(config.aiKeys),
      requestRestart,
      requestShutdown,
    });
    this.router.register(plugins);
  }

  async start() {
    try {
      this.channelJid = await resolveChannelJid(this.config);
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
      markOnlineOnConnect: this.stateStore.feature("alwaysOnline"),
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

    socket.ev.on("messages.update", (updates) => {
      void this.onMessageUpdates(socket, generation, updates);
    });

    socket.ev.on("presence.update", (update) => {
      if (!this.isCurrent(socket, generation) || !update?.id) return;
      const chat = this.presenceLog.get(update.id) || {};
      Object.assign(chat, update.presences || {});
      this.presenceLog.set(update.id, chat);
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
        { user: jidNumber(socket.user?.id), commands: this.router.routableCount() },
        `${this.config.botName} connected`,
      );
      if (this.stateStore.feature("startupMsg") && socket.user?.id) {
        const { youtube, group } = this.config.community;
        const chip = channelChip(this.channelJid);
        await socket.sendMessage(socket.user.id, {
          text: `⚡ ${this.config.botName} ${this.config.version} connected with ${this.router.routableCount()} commands.\n\n📺 Tutorials: ${youtube}\n👥 Community: ${group}`,
          ...(Object.keys(chip).length ? { contextInfo: chip } : {}),
        }).catch(() => {});
      }
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

  rememberMessage(details) {
    const chat = this.recentLog.get(details.chat) || [];
    chat.push({ raw: details.raw, details });
    if (chat.length > 80) chat.splice(0, chat.length - 80);
    this.recentLog.set(details.chat, chat);
  }

  findRecent(chat, id) {
    return (this.recentLog.get(chat) || []).find((entry) => entry.raw.key?.id === id) || null;
  }

  async onMessages(socket, generation, update) {
    if (!this.isCurrent(socket, generation) || update.type !== "notify") return;
    for (const raw of update.messages || []) {
      if (!raw?.message) continue;
      this.messageCount += 1;
      const details = messageDetails(raw);
      if (details.isStatus) {
        const mine = this.statusLog.get(details.sender) || [];
        mine.push({ key: raw.key, message: raw.message, at: Date.now() });
        if (mine.length > 10) mine.splice(0, mine.length - 10);
        this.statusLog.set(details.sender, mine);
        if (this.stateStore.feature("readStatus")) {
          await socket.readMessages([raw.key]).catch(() => {});
        }
        if (this.stateStore.feature("likeStatus")) {
          const emoji = this.stateStore.runtimeVar("statusEmoji") || "💚";
          await socket.sendMessage("status@broadcast", {
            react: { text: emoji, key: raw.key },
          }).catch(() => {});
        }
        if (this.stateStore.feature("saveStatus")) {
          await socket.sendMessage(this.config.owners[0] ? `${this.config.owners[0]}@s.whatsapp.net` : details.chat, {
            forward: { key: raw.key, message: raw.message },
          }).catch(() => {});
        }
        continue;
      }
      this.rememberMessage(details);
      if (this.stateStore.feature("readMsg")) await socket.readMessages([raw.key]).catch(() => {});
      await this.router.handle(socket, details).catch((error) =>
        logger.error({ error: safeError(error) }, "Message routing failed"),
      );
    }
  }

  async onMessageUpdates(socket, generation, updates) {
    if (!this.isCurrent(socket, generation)) return;
    for (const update of updates || []) {
      const chat = update.key?.remoteJid;
      if (!chat || chat === "status@broadcast") continue;

      if (update.update?.messageStubType === "REVOKE" && update.update?.key) {
        const entry = this.findRecent(chat, update.update.key.id);
        if (!entry) continue;
        this.deletedLog.set(chat, entry);
        const logChat = this.stateStore.runtimeVar("antideleteLog");
        if (this.stateStore.feature("antiDelete")) {
          const who = entry.details.fromMe ? "The bot" : `@${jidNumber(entry.details.sender)}`;
          await socket.sendMessage(chat, {
            text: `🕵️ ${who} deleted this message:`,
            mentions: entry.details.fromMe ? [] : [entry.details.sender],
          }).catch(() => {});
          await socket.sendMessage(chat, { forward: entry.raw }).catch(() => {});
        }
        if (logChat) {
          await socket.sendMessage(logChat, {
            text: `🗑️ Deleted message in ${chat}`,
          }).catch(() => {});
          await socket.sendMessage(logChat, { forward: entry.raw }).catch(() => {});
        }
        continue;
      }

      if (update.update?.message && update.key?.id) {
        const entry = this.findRecent(chat, update.key.id);
        if (!entry) continue;
        const before = entry.details.text;
        const after = messageDetails({ ...entry.raw, message: update.update.message }).text;
        if (before === after) continue;
        this.editLog.set(chat, { who: entry.details.sender, before, after, at: Date.now() });
        if (this.stateStore.feature("antiEdit")) {
          await socket.sendMessage(chat, {
            text: `✏️ A message was edited:\nBefore: ${before.slice(0, 300) || "(media)"}\nAfter: ${after.slice(0, 300) || "(media)"}`,
          }).catch(() => {});
        }
      }
    }
  }

  async onGroupParticipants(socket, generation, update) {
    if (!this.isCurrent(socket, generation)) return;
    const settings = this.stateStore.group(update.id);
    const key = update.action === "add" ? "welcome" : update.action === "remove" ? "goodbye" : null;
    if (!settings.events || !key || !settings[key]) return;

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
    if (!this.isCurrent(socket, generation) || !this.stateStore.feature("rejectCall")) return;
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

  async deliverReminders() {
    if (this.status !== "open" || !this.socket || this.shuttingDown) return;
    const due = await this.stateStore.takeDueReminders();
    for (const reminder of due) {
      await this.socket.sendMessage(reminder.chat, {
        text: `⏰ *REMINDER*\n${reminder.text}\n\nFor: @${jidNumber(reminder.owner)}`,
        mentions: [reminder.owner],
      }).catch((error) =>
        logger.warn({ error: safeError(error), reminder: reminder.id }, "Reminder delivery failed"),
      );
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
      commands: this.router.routableCount(),
      plugins: this.router.list().length,
      messagesProcessed: this.messageCount,
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
    clearInterval(this.reminderTimer);
    await this.closeSocket("Bot shutting down");
    await this.authStore.close();
    await this.stateStore.close();
  }
}

/**
 * Telegram adapter.
 *
 * Mirrors the public surface of `src/bot.js` (start / stop / publicStatus) so
 * `index.js` can run either platform — or both — without special-casing.
 * All command handling is delegated to the shared `CommandRouter`, which means
 * every plugin under `src/plugins/` is available on Telegram for free.
 */

import { logger, safeError } from "../logger.js";
import plugins from "../plugins/index.js";
import CommandRouter from "../router.js";
import AiService from "../services/ai.js";
import { formatDuration } from "../utils.js";

import { telegramDetails } from "./telegram-message.js";
import TelegramSocket from "./telegram-socket.js";

export default class TelegramBot {
  constructor({ config, database, stateStore, requestRestart, requestShutdown }) {
    this.config = config;
    this.database = database;
    this.stateStore = stateStore;
    this.platform = "telegram";
    this.telegraf = null;
    this.socket = null;
    this.botInfo = null;
    this.startedAt = Date.now();
    this.connectedAt = null;
    this.status = "initializing";
    this.error = null;
    this.messageCount = 0;
    this.shuttingDown = false;

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
    if (!this.config.telegramToken) {
      this.status = "awaiting-token";
      this.error = "Set TELEGRAM_BOT_TOKEN from @BotFather, then restart.";
      logger.warn("Telegram adapter idle: TELEGRAM_BOT_TOKEN is not set");
      return;
    }

    try {
      const { Telegraf } = await import("telegraf");
      this.telegraf = new Telegraf(this.config.telegramToken, {
        handlerTimeout: 120_000,
      });

      this.botInfo = await this.telegraf.telegram.getMe();
      this.socket = new TelegramSocket(this.telegraf.telegram, { botInfo: this.botInfo });

      this.telegraf.catch((error, ctx) => {
        logger.error(
          { error: safeError(error), updateType: ctx?.updateType },
          "Telegram handler error",
        );
      });

      this.telegraf.on("message", (ctx) => this.onMessage(ctx));
      this.telegraf.on("channel_post", (ctx) => this.onMessage(ctx));

      await this.publishCommandList();

      // launch() resolves only on stop, so it is intentionally not awaited.
      void this.telegraf
        .launch({ dropPendingUpdates: true })
        .catch((error) => {
          this.status = "error";
          this.error = safeError(error);
          logger.error({ error: safeError(error) }, "Telegram polling stopped");
        });

      this.status = "open";
      this.connectedAt = Date.now();
      logger.info(
        { username: this.botInfo.username, commands: this.router.routableCount() },
        "Telegram bot connected",
      );
    } catch (error) {
      this.status = "error";
      this.error = safeError(error);
      logger.error({ error: safeError(error) }, "Telegram startup failed");
    }
  }

  /**
   * Telegram's native prefix is "/", and clients strip "@botname" suffixes in
   * groups. Normalise both to the configured prefix so plugins see the exact
   * text shape they already expect (e.g. ".menu").
   */
  normalizeCommandText(details) {
    const prefix = this.stateStore.prefix;
    let text = details.text;
    if (!text) return details;

    const username = this.botInfo?.username;
    if (username) {
      text = text.replace(new RegExp(`^(/[A-Za-z0-9_]+)@${username}\\b`, "i"), "$1");
    }
    if (text.startsWith("/") && prefix !== "/") {
      text = `${prefix}${text.slice(1)}`;
    }
    return text === details.text ? details : { ...details, text };
  }

  async onMessage(ctx) {
    if (this.shuttingDown) return;
    const details = telegramDetails(ctx.update, this.botInfo?.id);
    if (!details) return;

    this.messageCount += 1;
    try {
      await this.router.handle(this.socket, this.normalizeCommandText(details));
    } catch (error) {
      logger.error({ error: safeError(error) }, "Telegram message failed");
    }
  }

  /**
   * Registers the command list shown in Telegram's "/" menu. The Bot API caps
   * this at 100 entries, so we publish the highest-value commands and let the
   * full 633 stay reachable by typing them.
   */
  async publishCommandList() {
    const featured = [
      "menu", "help", "ping", "alive", "ai", "gemini", "gpt", "imagine",
      "song", "video", "tiktok", "instagram", "facebook", "spotify",
      "sticker", "toimg", "tomp3", "translate", "qrcode", "ss",
      "lyrics", "weather", "wiki", "google", "define", "calc",
      "carbon", "drake", "wanted", "neon3d", "glitch", "matrix",
      "daily", "work", "balance", "blackjack", "hangman", "ttt",
      "tagall", "hidetag", "kick", "promote", "demote", "antilink",
    ];

    const commands = featured
      .map((name) => this.router.find(name))
      .filter(Boolean)
      .filter((command, index, all) => all.findIndex((c) => c.name === command.name) === index)
      .slice(0, 100)
      .map((command) => ({
        command: command.name,
        description: String(command.description || command.name).slice(0, 256),
      }));

    if (commands.length) {
      await this.telegraf.telegram.setMyCommands(commands).catch((error) => {
        logger.warn({ error: safeError(error) }, "Could not publish Telegram command list");
      });
    }
  }

  publicStatus() {
    return {
      name: this.config.botName,
      platform: "telegram",
      username: this.botInfo?.username ? `@${this.botInfo.username}` : null,
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
      reconnectAttempt: 0,
      error: ["error", "awaiting-token"].includes(this.status) ? this.error : null,
    };
  }

  async stop() {
    this.shuttingDown = true;
    this.status = "stopping";
    try {
      this.telegraf?.stop("SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}

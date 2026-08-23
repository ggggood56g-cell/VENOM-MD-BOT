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
import {
  categoryKeyboard,
  categoryText,
  helpCard,
  homeKeyboard,
  homeText,
} from "./telegram-ui.js";

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

      // The interactive menu is Telegram-native, so it is intercepted before
      // the shared router: /menu with no arguments opens an inline keyboard
      // instead of printing the 633-line text menu WhatsApp needs.
      this.telegraf.command(["menu", "start", "commands", "list"], (ctx) =>
        this.onMenuCommand(ctx),
      );
      this.telegraf.on("callback_query", (ctx) => this.onCallback(ctx));
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

  links() {
    return {
      repo: this.config.community?.repo,
      youtube: this.config.community?.youtube,
    };
  }

  /** `/menu` and `/start` open the inline keyboard. `/menu ai` still works. */
  async onMenuCommand(ctx) {
    const argument = String(ctx.message?.text || "")
      .split(/\s+/)
      .slice(1)
      .join(" ")
      .trim();

    // With an argument the user wants the classic text listing, so hand the
    // message to the shared plugin exactly as before.
    if (argument) return this.onMessage(ctx);

    await ctx
      .reply(homeText(this.config, this.router), {
        parse_mode: "HTML",
        reply_markup: homeKeyboard(this.router, this.links()),
      })
      .catch((error) => logger.error({ error: safeError(error) }, "Menu render failed"));
    return undefined;
  }

  async onCallback(ctx) {
    const data = String(ctx.callbackQuery?.data || "");
    if (!data.startsWith("m")) return;

    // Always answer: Telegram shows a spinner on the button until we do.
    const ack = (text) => ctx.answerCbQuery(text).catch(() => {});
    const parts = data.split(":");
    const action = parts[1] || "";

    try {
      if (action === "noop") return void (await ack());

      if (action === "x") {
        await ack("Closed");
        return void (await ctx.deleteMessage().catch(() => {}));
      }

      if (action === "") {
        await ack();
        return void (await ctx.editMessageText(homeText(this.config, this.router), {
          parse_mode: "HTML",
          reply_markup: homeKeyboard(this.router, this.links()),
        }).catch(() => {}));
      }

      if (action === "c") {
        const category = parts[2];
        const info = categoryKeyboard(this.router, category, Number.parseInt(parts[3], 10) || 0);
        await ack();
        return void (await ctx.editMessageText(
          categoryText(category, info, this.stateStore.prefix),
          { parse_mode: "HTML", reply_markup: info.keyboard },
        ).catch(() => {}));
      }

      if (action === "h") {
        const command = this.router.find(parts[2]);
        if (!command) return void (await ack("Command not found"));
        const card = helpCard(command, this.stateStore.prefix);
        await ack();
        return void (await ctx.editMessageText(card.text, {
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        }).catch(() => {}));
      }

      if (action === "r") {
        const command = this.router.find(parts[2]);
        if (!command) return void (await ack("Command not found"));
        await ack(`Running ${command.name}…`);
        // Re-enter the shared router so the command runs through the exact
        // same path (permissions, rate limits, features) as a typed message.
        const message = {
          message_id: ctx.callbackQuery.message?.message_id,
          date: Math.floor(Date.now() / 1000),
          chat: ctx.callbackQuery.message?.chat,
          from: ctx.callbackQuery.from,
          text: `${this.stateStore.prefix}${command.name}`,
        };
        const details = telegramDetails({ message }, this.botInfo?.id);
        if (details) await this.router.handle(this.socket, details);
        return undefined;
      }
    } catch (error) {
      logger.error({ error: safeError(error), data }, "Telegram callback failed");
      await ack("Something went wrong");
    }
    return undefined;
  }

  async onMessage(ctx) {
    if (this.shuttingDown) return;
    const details = telegramDetails(ctx?.update || ctx, this.botInfo?.id);
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
      "start", "menu", "help", "ping", "alive", "ai", "gemini", "gpt", "imagine",
      "song", "video", "tiktok", "instagram", "facebook", "spotify",
      "sticker", "toimg", "tomp3", "translate", "qrcode", "ss",
      "lyrics", "weather", "wiki", "google", "define", "calc",
      "carbon", "drake", "wanted", "neon3d", "glitch", "matrix",
      "daily", "work", "balance", "blackjack", "hangman", "ttt",
      "tagall", "hidetag", "kick", "promote", "demote", "antilink",
    ];

    const commands = featured
      .map((name) =>
        name === "start"
          ? { name: "start", description: "Open the interactive menu." }
          : this.router.find(name),
      )
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

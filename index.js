import config from "./src/config.js";
import AuthStore from "./src/auth-store.js";
import VenomBot from "./src/bot.js";
import Database from "./src/database.js";
import { logger, safeError } from "./src/logger.js";
import { createServer } from "./src/server.js";
import StateStore from "./src/state-store.js";

logger.info(
  {
    version: process.env.npm_package_version || "1.0.0",
    node: process.version,
    platform: config.platformMode,
  },
  `Starting ${config.botName}`,
);

const database = new Database(config);
await database.connect();
const stateStore = await new StateStore(config, database).init();
const authStore = new AuthStore(config, database);

let shuttingDown = false;
let server;
const bots = [];

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => process.exit(exitCode || 1), 12_000);
  forceExit.unref?.();
  for (const bot of bots) {
    await bot?.stop().catch((error) =>
      logger.error({ error: safeError(error) }, "Bot shutdown failed"),
    );
  }
  await database.close();
  await new Promise((resolve) => server?.close(resolve));
  clearTimeout(forceExit);
  process.exit(exitCode);
}

const shared = {
  config,
  database,
  stateStore,
  requestRestart: () => void shutdown("owner restart", 1),
  requestShutdown: () => void shutdown("owner shutdown", 0),
};

// PLATFORM=whatsapp (default) | telegram | both.
// Adapters are imported lazily so a Telegram-only deploy never loads Baileys
// and a WhatsApp-only deploy never loads Telegraf.
if (config.platformMode === "whatsapp" || config.platformMode === "both") {
  bots.push(new VenomBot({ ...shared, authStore }));
}
if (config.platformMode === "telegram" || config.platformMode === "both") {
  const { default: TelegramBot } = await import("./src/adapters/telegram.js");
  bots.push(new TelegramBot(shared));
}

server = createServer(config, bots);
server.on("listening", () =>
  logger.info({ port: config.port }, "Health server listening"),
);
server.on("error", (error) => {
  logger.fatal({ error: safeError(error) }, "Health server failed");
  void shutdown("server error", 1);
});

await Promise.all(bots.map((bot) => bot.start()));

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) =>
  logger.error({ error: safeError(error) }, "Unhandled promise rejection"),
);
process.on("uncaughtException", (error) => {
  logger.fatal({ error: safeError(error) }, "Uncaught exception");
  void shutdown("uncaught exception", 1);
});

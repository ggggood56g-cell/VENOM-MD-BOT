import config from "./src/config.js";
import AuthStore from "./src/auth-store.js";
import VenomBot from "./src/bot.js";
import Database from "./src/database.js";
import { logger, safeError } from "./src/logger.js";
import { createServer } from "./src/server.js";
import StateStore from "./src/state-store.js";

logger.info(
  { version: process.env.npm_package_version || "1.0.0", node: process.version },
  `Starting ${config.botName}`,
);

const database = new Database(config);
await database.connect();
const stateStore = await new StateStore(config, database).init();
const authStore = new AuthStore(config, database);

let shuttingDown = false;
let server;
let bot;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => process.exit(exitCode || 1), 12_000);
  forceExit.unref?.();
  await bot?.stop().catch((error) =>
    logger.error({ error: safeError(error) }, "Bot shutdown failed"),
  );
  await database.close();
  await new Promise((resolve) => server?.close(resolve));
  clearTimeout(forceExit);
  process.exit(exitCode);
}

bot = new VenomBot({
  config,
  database,
  authStore,
  stateStore,
  requestRestart: () => void shutdown("owner restart", 1),
});
server = createServer(config, bot);
server.on("listening", () =>
  logger.info({ port: config.port }, "Health server listening"),
);
server.on("error", (error) => {
  logger.fatal({ error: safeError(error) }, "Health server failed");
  void shutdown("server error", 1);
});

await bot.start();

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) =>
  logger.error({ error: safeError(error) }, "Unhandled promise rejection"),
);
process.on("uncaughtException", (error) => {
  logger.fatal({ error: safeError(error) }, "Uncaught exception");
  void shutdown("uncaught exception", 1);
});

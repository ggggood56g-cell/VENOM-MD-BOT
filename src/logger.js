import pino from "pino";

import config from "./config.js";

const redact = {
  paths: [
    "sessionId",
    "credential",
    "SESSION_ID",
    "databaseUrl",
    "password",
    "*.password",
  ],
  censor: "[redacted]",
};

export const logger = pino({
  level: config.logLevel,
  base: { app: "venom-md" },
  redact,
});

export const baileysLogger = pino({
  level: config.baileysLogLevel,
  base: undefined,
  redact,
});

export function safeError(error) {
  const message = String(error?.message || error || "Unknown error");
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted MongoDB URL]")
    .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[redacted credential]")
    .slice(0, 500);
}

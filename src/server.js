import express from "express";

export function createServer(config, bot) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.use((_request, response, next) => {
    response.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    next();
  });

  app.get("/", (_request, response) => {
    response.type("text/plain").send(`${config.botName} is running.`);
  });

  app.get("/health", (_request, response) => {
    response.json({ ok: true, ...bot.publicStatus() });
  });

  app.get("/api/status", (_request, response) => {
    response.json(bot.publicStatus());
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  const server = app.listen(config.port, "0.0.0.0");

  // 24/7 keep-alive: pings our own /health endpoint every 4 minutes so free
  // hosts (Render, Koyeb, Railway…) never idle the app to sleep. Point
  // PING_URL at any public URL (or an UptimeRobot monitor) for extra cover.
  const selfPing = () => {
    const target = process.env.PING_URL
      || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/health` : "")
      || `http://127.0.0.1:${config.port}/health`;
    fetch(target, { signal: AbortSignal.timeout(10_000) }).catch(() => {});
  };
  const pingTimer = setInterval(selfPing, 4 * 60_000);
  pingTimer.unref?.();
  setTimeout(selfPing, 30_000).unref?.();

  return server;
}

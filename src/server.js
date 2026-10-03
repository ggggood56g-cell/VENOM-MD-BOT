import express from "express";

export function createServer(config, bot) {
  // Accepts a single bot (legacy) or an array of adapters (PLATFORM=both).
  const bots = Array.isArray(bot) ? bot.filter(Boolean) : [bot].filter(Boolean);
  const status = () => {
    const all = bots.map((instance) => instance.publicStatus());
    if (all.length <= 1) return all[0] || { status: "no-adapter", connected: false };
    return {
      ...all[0],
      platform: "both",
      connected: all.some((entry) => entry.connected),
      adapters: Object.fromEntries(
        all.map((entry) => [entry.platform || "whatsapp", entry]),
      ),
    };
  };

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
    response.json({ ok: true, ...status() });
  });

  app.get("/api/status", (_request, response) => {
    response.json(status());
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

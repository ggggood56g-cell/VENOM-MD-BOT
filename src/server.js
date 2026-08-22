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

  return app.listen(config.port, "0.0.0.0");
}

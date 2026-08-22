import { MongoClient } from "mongodb";

import { logger, safeError } from "./logger.js";

export default class Database {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.db = null;
    this.status = config.databaseUrl ? "connecting" : "local";
  }

  async connect() {
    if (!this.config.databaseUrl) {
      logger.info("No MongoDB URL configured; using local persistent files");
      return null;
    }

    try {
      this.client = new MongoClient(this.config.databaseUrl, {
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 8,
      });
      await this.client.connect();
      this.db = this.client.db(this.config.databaseName);
      await this.db.command({ ping: 1 });
      this.status = "connected";
      logger.info("MongoDB connected");
      return this.db;
    } catch (error) {
      this.status = "unavailable";
      logger.warn({ error: safeError(error) }, "MongoDB unavailable; using local files");
      await this.client?.close().catch(() => {});
      this.client = null;
      this.db = null;
      return null;
    }
  }

  collection(name) {
    return this.db?.collection(name) || null;
  }

  async close() {
    await this.client?.close().catch(() => {});
    this.client = null;
    this.db = null;
    if (this.status === "connected") this.status = "closed";
  }
}

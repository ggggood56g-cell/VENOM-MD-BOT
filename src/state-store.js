import fs from "node:fs";
import path from "node:path";

import { logger, safeError } from "./logger.js";

const DEFAULT_GROUP = Object.freeze({
  antiLink: "off",
  welcome: false,
  goodbye: false,
  welcomeText: "Welcome @user to *{group}*!",
  goodbyeText: "Goodbye @user from *{group}*.",
});

function cleanGroup(value = {}) {
  const antiLink = ["off", "delete", "warn", "kick"].includes(value.antiLink)
    ? value.antiLink
    : "off";
  return {
    antiLink,
    welcome: value.welcome === true,
    goodbye: value.goodbye === true,
    welcomeText: String(value.welcomeText || DEFAULT_GROUP.welcomeText).slice(0, 500),
    goodbyeText: String(value.goodbyeText || DEFAULT_GROUP.goodbyeText).slice(0, 500),
  };
}

export default class StateStore {
  constructor(config, database) {
    this.config = config;
    this.database = database;
    this.file = path.join(config.root, "data", "state.json");
    this.state = {
      global: { mode: config.mode, prefix: config.prefixes[0] },
      groups: {},
      warnings: {},
    };
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    let loaded = null;

    const collection = this.database.collection("bot_state");
    if (collection) {
      try {
        loaded = (await collection.findOne({ _id: this.config.sessionNamespace }))?.state;
      } catch (error) {
        logger.warn({ error: safeError(error) }, "Could not restore settings from MongoDB");
      }
    }

    if (!loaded) {
      try {
        loaded = JSON.parse(await fs.promises.readFile(this.file, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") {
          logger.warn({ error: safeError(error) }, "Ignoring invalid local state file");
        }
      }
    }

    if (loaded && typeof loaded === "object") {
      this.state.global.mode = loaded.global?.mode === "private" ? "private" : "public";
      this.state.global.prefix = /^\S{1,4}$/u.test(loaded.global?.prefix)
        ? loaded.global.prefix
        : this.config.prefixes[0];
      for (const [jid, group] of Object.entries(loaded.groups || {}).slice(0, 2_000)) {
        if (jid.endsWith("@g.us")) this.state.groups[jid] = cleanGroup(group);
      }
      this.state.warnings = loaded.warnings && typeof loaded.warnings === "object"
        ? loaded.warnings
        : {};
    }

    await this.save();
    return this;
  }

  get mode() {
    return this.state.global.mode;
  }

  get prefix() {
    return this.state.global.prefix;
  }

  group(jid) {
    if (!this.state.groups[jid]) this.state.groups[jid] = { ...DEFAULT_GROUP };
    return { ...this.state.groups[jid] };
  }

  async setGlobal(patch) {
    if (patch.mode) this.state.global.mode = patch.mode === "private" ? "private" : "public";
    if (patch.prefix && /^\S{1,4}$/u.test(patch.prefix)) {
      this.state.global.prefix = patch.prefix;
    }
    await this.save();
    return { ...this.state.global };
  }

  async setGroup(jid, patch) {
    this.state.groups[jid] = cleanGroup({ ...this.group(jid), ...patch });
    await this.save();
    return this.group(jid);
  }

  async warn(groupJid, userJid) {
    this.state.warnings[groupJid] ||= {};
    const key = String(userJid);
    this.state.warnings[groupJid][key] = Math.min(
      3,
      (Number(this.state.warnings[groupJid][key]) || 0) + 1,
    );
    await this.save();
    return this.state.warnings[groupJid][key];
  }

  async clearWarning(groupJid, userJid) {
    if (this.state.warnings[groupJid]) delete this.state.warnings[groupJid][String(userJid)];
    await this.save();
  }

  async save() {
    const snapshot = JSON.parse(JSON.stringify(this.state));
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const temporary = `${this.file}.tmp`;
        await fs.promises.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {
          mode: 0o600,
        });
        await fs.promises.rename(temporary, this.file);

        const collection = this.database.collection("bot_state");
        if (collection) {
          await collection.updateOne(
            { _id: this.config.sessionNamespace },
            { $set: { state: snapshot, updatedAt: new Date() } },
            { upsert: true },
          );
        }
      })
      .catch((error) =>
        logger.error({ error: safeError(error) }, "Could not save bot settings"),
      );
    return this.writeQueue;
  }

  async close() {
    await this.writeQueue.catch(() => {});
  }
}

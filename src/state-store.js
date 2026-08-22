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

const DEFAULT_ECONOMY = Object.freeze({
  wallet: 500,
  bank: 0,
  bankLimit: 5_000,
  debt: 0,
  streak: 0,
  lastDaily: 0,
  inventory: {},
  cooldowns: {},
});

function boundedMoney(value, maximum = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const number = Math.floor(parsed);
  return Math.min(maximum, Math.max(0, number));
}

function cleanEconomy(value = {}) {
  const inventory = {};
  for (const [name, amount] of Object.entries(value.inventory || {}).slice(0, 100)) {
    if (/^[a-z0-9-]{1,32}$/.test(name)) inventory[name] = Math.min(999, boundedMoney(amount, 999));
  }
  const cooldowns = {};
  for (const [name, timestamp] of Object.entries(value.cooldowns || {}).slice(0, 50)) {
    if (/^[a-z0-9-]{1,32}$/.test(name) && Number.isFinite(Number(timestamp))) {
      cooldowns[name] = Number(timestamp);
    }
  }
  return {
    wallet: boundedMoney(value.wallet ?? DEFAULT_ECONOMY.wallet),
    bank: boundedMoney(value.bank),
    bankLimit: Math.max(5_000, boundedMoney(value.bankLimit || DEFAULT_ECONOMY.bankLimit, 100_000_000)),
    debt: boundedMoney(value.debt),
    streak: boundedMoney(value.streak, 365),
    lastDaily: Number(value.lastDaily) || 0,
    inventory,
    cooldowns,
  };
}

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
      global: { mode: config.mode, prefix: config.prefixes[0], banned: [] },
      groups: {},
      warnings: {},
      economy: {},
      notes: {},
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
      this.state.global.banned = [...new Set(
        (Array.isArray(loaded.global?.banned) ? loaded.global.banned : [])
          .map(String)
          .filter((jid) => jid.length > 5 && jid.length <= 128),
      )].slice(0, 10_000);
      for (const [jid, group] of Object.entries(loaded.groups || {}).slice(0, 2_000)) {
        if (jid.endsWith("@g.us")) this.state.groups[jid] = cleanGroup(group);
      }
      this.state.warnings = loaded.warnings && typeof loaded.warnings === "object"
        ? loaded.warnings
        : {};
      for (const [jid, account] of Object.entries(loaded.economy || {}).slice(0, 20_000)) {
        if (typeof jid === "string" && jid.length <= 128) {
          this.state.economy[jid] = cleanEconomy(account);
        }
      }
      for (const [jid, notes] of Object.entries(loaded.notes || {}).slice(0, 20_000)) {
        if (typeof jid !== "string" || typeof notes !== "object" || !notes) continue;
        this.state.notes[jid] = {};
        for (const [name, text] of Object.entries(notes).slice(0, 100)) {
          if (/^[a-z0-9_-]{1,32}$/.test(name) && typeof text === "string") {
            this.state.notes[jid][name] = text.slice(0, 2_000);
          }
        }
      }
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

  isBanned(jid) {
    return this.state.global.banned.includes(String(jid));
  }

  bannedUsers() {
    return [...this.state.global.banned];
  }

  async setBanned(jid, banned) {
    const key = String(jid);
    const users = new Set(this.state.global.banned);
    if (banned) users.add(key);
    else users.delete(key);
    this.state.global.banned = [...users].slice(0, 10_000);
    await this.save();
    return this.isBanned(key);
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

  economy(jid) {
    const key = String(jid);
    if (!this.state.economy[key]) this.state.economy[key] = { ...DEFAULT_ECONOMY, inventory: {}, cooldowns: {} };
    return cleanEconomy(this.state.economy[key]);
  }

  async updateEconomy(jid, updater) {
    const key = String(jid);
    const current = this.economy(key);
    const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
    this.state.economy[key] = cleanEconomy(next);
    await this.save();
    return this.economy(key);
  }

  async transferMoney(fromJid, toJid, amount) {
    const value = boundedMoney(amount);
    if (value < 1) throw new Error("Enter an amount greater than zero.");
    const sender = this.economy(fromJid);
    if (sender.wallet < value) throw new Error("You do not have enough wallet balance.");
    const recipient = this.economy(toJid);
    sender.wallet -= value;
    recipient.wallet = boundedMoney(recipient.wallet + value);
    this.state.economy[String(fromJid)] = cleanEconomy(sender);
    this.state.economy[String(toJid)] = cleanEconomy(recipient);
    await this.save();
    return { sender: this.economy(fromJid), recipient: this.economy(toJid) };
  }

  economyLeaders(limit = 10) {
    return Object.entries(this.state.economy)
      .map(([jid, account]) => {
        const clean = cleanEconomy(account);
        return { jid, total: clean.wallet + clean.bank - clean.debt, ...clean };
      })
      .sort((first, second) => second.total - first.total)
      .slice(0, limit);
  }

  async resetEconomy(jid) {
    this.state.economy[String(jid)] = { ...DEFAULT_ECONOMY, inventory: {}, cooldowns: {} };
    await this.save();
    return this.economy(jid);
  }

  notes(jid) {
    return { ...(this.state.notes[String(jid)] || {}) };
  }

  async setNote(jid, name, text) {
    const key = String(name || "").toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(key)) {
      throw new Error("Note names may use letters, numbers, underscores and hyphens.");
    }
    const value = String(text || "").trim();
    if (!value || value.length > 2_000) throw new Error("Note text must be 1–2,000 characters.");
    const user = String(jid);
    this.state.notes[user] ||= {};
    if (!this.state.notes[user][key] && Object.keys(this.state.notes[user]).length >= 100) {
      throw new Error("You have reached the 100-note limit.");
    }
    this.state.notes[user][key] = value;
    await this.save();
    return value;
  }

  async deleteNote(jid, name) {
    const user = String(jid);
    const key = String(name || "").toLowerCase();
    const existed = Boolean(this.state.notes[user]?.[key]);
    if (this.state.notes[user]) delete this.state.notes[user][key];
    await this.save();
    return existed;
  }

  async clearNotes(jid) {
    delete this.state.notes[String(jid)];
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

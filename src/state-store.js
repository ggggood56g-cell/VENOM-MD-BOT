import fs from "node:fs";
import path from "node:path";

import { logger, safeError } from "./logger.js";

const DEFAULT_GROUP = Object.freeze({
  antiLink: "off",
  antiBot: false,
  antiSpam: false,
  antiTag: false,
  antiWords: [],
  welcome: false,
  goodbye: false,
  events: true,
  welcomeText: "Welcome @user to *{group}*!",
  goodbyeText: "Goodbye @user from *{group}*.",
});

const DEFAULT_FEATURES = Object.freeze({
  alwaysOnline: false,
  autoTyping: false,
  cmdReact: true,
  readMsg: false,
  readStatus: false,
  rejectCall: true,
  startupMsg: true,
  antiDelete: false,
  antiEdit: false,
  likeStatus: false,
  saveStatus: false,
  vvCmd: false,
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
    antiBot: value.antiBot === true,
    antiSpam: value.antiSpam === true,
    antiTag: value.antiTag === true,
    antiWords: [...new Set(
      (Array.isArray(value.antiWords) ? value.antiWords : [])
        .map((word) => String(word).trim().toLowerCase())
        .filter((word) => /^\S{1,40}$/u.test(word)),
    )].slice(0, 100),
    welcome: value.welcome === true,
    goodbye: value.goodbye === true,
    events: value.events !== false,
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
      global: {
        mode: config.mode,
        prefix: config.prefixes[0],
        banned: [],
        features: {
          ...DEFAULT_FEATURES,
          alwaysOnline: config.alwaysOnline,
          cmdReact: config.commandReact,
          readMsg: config.autoRead,
          readStatus: config.autoReadStatus,
          rejectCall: config.rejectCalls,
        },
      },
      groups: {},
      warnings: {},
      economy: {},
      notes: {},
      filters: { private: {}, groups: {} },
      customCommands: {},
      afk: {},
      reminders: [],
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
      const loadedFeatures = loaded.global?.features || {};
      for (const key of Object.keys(DEFAULT_FEATURES)) {
        if (typeof loadedFeatures[key] === "boolean") {
          this.state.global.features[key] = loadedFeatures[key];
        }
      }
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
      for (const [name, response] of Object.entries(loaded.customCommands || {}).slice(0, 200)) {
        if (/^[a-z0-9-]{1,32}$/.test(name) && typeof response === "string") {
          this.state.customCommands[name] = response.slice(0, 4_000);
        }
      }
      for (const [jid, entry] of Object.entries(loaded.afk || {}).slice(0, 20_000)) {
        if (entry && typeof entry.reason === "string" && Number.isFinite(Number(entry.since))) {
          this.state.afk[jid] = { reason: entry.reason.slice(0, 300), since: Number(entry.since) };
        }
      }
      this.state.reminders = (Array.isArray(loaded.reminders) ? loaded.reminders : [])
        .filter((item) => item && typeof item.id === "string" && typeof item.chat === "string" && typeof item.text === "string" && Number.isFinite(Number(item.dueAt)))
        .slice(0, 1_000)
        .map((item) => ({ id: item.id.slice(0, 32), owner: String(item.owner).slice(0, 128), chat: item.chat.slice(0, 128), text: item.text.slice(0, 1_000), dueAt: Number(item.dueAt) }));
      const privateFilters = loaded.filters?.private || {};
      for (const [trigger, response] of Object.entries(privateFilters).slice(0, 200)) {
        if (trigger.length <= 100 && typeof response === "string") this.state.filters.private[trigger.toLowerCase()] = response.slice(0, 2_000);
      }
      for (const [jid, filters] of Object.entries(loaded.filters?.groups || {}).slice(0, 2_000)) {
        if (!jid.endsWith("@g.us") || !filters || typeof filters !== "object") continue;
        this.state.filters.groups[jid] = {};
        for (const [trigger, response] of Object.entries(filters).slice(0, 100)) {
          if (trigger.length <= 100 && typeof response === "string") this.state.filters.groups[jid][trigger.toLowerCase()] = response.slice(0, 2_000);
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
    if (!this.state.groups[jid]) {
      this.state.groups[jid] = { ...DEFAULT_GROUP, antiWords: [] };
    }
    return { ...this.state.groups[jid], antiWords: [...this.state.groups[jid].antiWords] };
  }

  feature(name) {
    return Boolean(this.state.global.features[name]);
  }

  features() {
    return { ...this.state.global.features };
  }

  async setFeature(name, enabled) {
    if (!(name in DEFAULT_FEATURES)) throw new Error(`Unknown feature: ${name}.`);
    this.state.global.features[name] = Boolean(enabled);
    await this.save();
    return this.feature(name);
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

  customCommand(name) {
    return this.state.customCommands[String(name || "").toLowerCase()] || "";
  }

  customCommands() {
    return { ...this.state.customCommands };
  }

  async setCustomCommand(name, response) {
    const key = String(name || "").toLowerCase();
    const value = String(response || "").trim();
    if (!/^[a-z0-9-]{1,32}$/.test(key)) throw new Error("Command names may use lowercase letters, numbers and hyphens.");
    if (!value || value.length > 4_000) throw new Error("Command response must be 1–4,000 characters.");
    if (!this.state.customCommands[key] && Object.keys(this.state.customCommands).length >= 200) {
      throw new Error("The custom-command limit has been reached.");
    }
    this.state.customCommands[key] = value;
    await this.save();
    return value;
  }

  async deleteCustomCommand(name) {
    const key = String(name || "").toLowerCase();
    const existed = Boolean(this.state.customCommands[key]);
    delete this.state.customCommands[key];
    await this.save();
    return existed;
  }

  async clearCustomCommands() {
    this.state.customCommands = {};
    await this.save();
  }

  filters(scope = "private", chat = "") {
    return scope === "group"
      ? { ...(this.state.filters.groups[chat] || {}) }
      : { ...this.state.filters.private };
  }

  filterResponse(text, chat, isGroup) {
    const key = String(text || "").trim().toLowerCase();
    return isGroup
      ? this.state.filters.groups[chat]?.[key] || ""
      : this.state.filters.private[key] || "";
  }

  async setFilter(scope, chat, trigger, response) {
    const key = String(trigger || "").trim().toLowerCase();
    const value = String(response || "").trim();
    if (!key || key.length > 100 || !value || value.length > 2_000) {
      throw new Error("Filter trigger/response is missing or too long.");
    }
    const target = scope === "group"
      ? (this.state.filters.groups[chat] ||= {})
      : this.state.filters.private;
    if (!target[key] && Object.keys(target).length >= (scope === "group" ? 100 : 200)) {
      throw new Error("Filter limit reached.");
    }
    target[key] = value;
    await this.save();
  }

  async deleteFilter(scope, chat, trigger) {
    const key = String(trigger || "").trim().toLowerCase();
    const target = scope === "group"
      ? this.state.filters.groups[chat] || {}
      : this.state.filters.private;
    const existed = Boolean(target[key]);
    delete target[key];
    await this.save();
    return existed;
  }

  afk(jid) {
    const value = this.state.afk[String(jid)];
    return value ? { ...value } : null;
  }

  async setAfk(jid, reason = "Away") {
    this.state.afk[String(jid)] = {
      reason: String(reason || "Away").slice(0, 300),
      since: Date.now(),
    };
    await this.save();
    return this.afk(jid);
  }

  async clearAfk(jid) {
    const value = this.afk(jid);
    delete this.state.afk[String(jid)];
    if (value) await this.save();
    return value;
  }

  reminders(jid) {
    return this.state.reminders.filter((item) => item.owner === String(jid)).map((item) => ({ ...item }));
  }

  async addReminder(reminder) {
    if (this.state.reminders.length >= 1_000) throw new Error("The reminder limit has been reached.");
    this.state.reminders.push({
      id: String(reminder.id).slice(0, 32),
      owner: String(reminder.owner).slice(0, 128),
      chat: String(reminder.chat).slice(0, 128),
      text: String(reminder.text).slice(0, 1_000),
      dueAt: Number(reminder.dueAt),
    });
    await this.save();
  }

  async deleteReminder(owner, id) {
    const before = this.state.reminders.length;
    this.state.reminders = this.state.reminders.filter(
      (item) => !(item.owner === String(owner) && item.id === String(id)),
    );
    if (this.state.reminders.length !== before) await this.save();
    return this.state.reminders.length !== before;
  }

  async takeDueReminders(now = Date.now()) {
    const due = this.state.reminders.filter((item) => item.dueAt <= now);
    if (due.length) {
      const ids = new Set(due.map((item) => item.id));
      this.state.reminders = this.state.reminders.filter((item) => !ids.has(item.id));
      await this.save();
    }
    return due.map((item) => ({ ...item }));
  }

  async cleanRuntimeData(now = Date.now()) {
    let removed = 0;
    const beforeReminders = this.state.reminders.length;
    this.state.reminders = this.state.reminders.filter(
      (item) => item.dueAt > now - 7 * 86_400_000,
    );
    removed += beforeReminders - this.state.reminders.length;
    for (const account of Object.values(this.state.economy)) {
      for (const [name, timestamp] of Object.entries(account.cooldowns || {})) {
        if (Number(timestamp) < now - 30 * 86_400_000) {
          delete account.cooldowns[name];
          removed += 1;
        }
      }
    }
    for (const [group, warnings] of Object.entries(this.state.warnings)) {
      for (const [jid, count] of Object.entries(warnings || {})) {
        if (Number(count) <= 0) {
          delete warnings[jid];
          removed += 1;
        }
      }
      if (!Object.keys(warnings || {}).length) delete this.state.warnings[group];
    }
    await this.save();
    return removed;
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

import fs from "node:fs";
import path from "node:path";

import { BufferJSON, useMultiFileAuthState } from "baileys";

import { consumeSessionCredential } from "./config.js";
import { logger, safeError } from "./logger.js";

const MAX_CREDENTIAL_TEXT = 2 * 1024 * 1024;
const MAX_CREDENTIAL_JSON = 1024 * 1024;
const MAX_BACKUP_BYTES = 24 * 1024 * 1024;

const isRecord = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function isKeyPair(value) {
  return (
    isRecord(value) &&
    Buffer.isBuffer(value.private) &&
    value.private.length === 32 &&
    Buffer.isBuffer(value.public) &&
    value.public.length === 32
  );
}

export function decodeSessionCredential(value) {
  const encoded = String(value || "").trim();
  if (!encoded) return null;
  if (encoded.length > MAX_CREDENTIAL_TEXT) {
    throw new Error("SESSION_ID exceeds the 2 MB safety limit");
  }
  if (
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  ) {
    throw new Error("SESSION_ID is not canonical base64");
  }

  const decoded = Buffer.from(encoded, "base64");
  if (!decoded.length || decoded.length > MAX_CREDENTIAL_JSON) {
    throw new Error("SESSION_ID decodes to an invalid size");
  }

  let credentials;
  try {
    credentials = JSON.parse(decoded.toString("utf8"), BufferJSON.reviver);
  } catch {
    throw new Error("SESSION_ID does not contain valid creds.json data");
  }

  const valid =
    isRecord(credentials) &&
    credentials.registered === true &&
    Number.isSafeInteger(credentials.registrationId) &&
    isKeyPair(credentials.noiseKey) &&
    isKeyPair(credentials.signedIdentityKey) &&
    isRecord(credentials.signedPreKey) &&
    isKeyPair(credentials.signedPreKey.keyPair) &&
    typeof credentials.advSecretKey === "string" &&
    credentials.advSecretKey.length >= 32 &&
    isRecord(credentials.me) &&
    /@(s\.whatsapp\.net|lid)$/.test(String(credentials.me.id || ""));

  if (!valid) {
    throw new Error("SESSION_ID is incomplete or is not a linked WhatsApp session");
  }

  return `${JSON.stringify(credentials, BufferJSON.replacer)}\n`;
}

function safeSessionFilename(value) {
  return (
    typeof value === "string" &&
    value.length >= 6 &&
    value.length <= 240 &&
    value.endsWith(".json") &&
    path.basename(value) === value &&
    !/[\\/\u0000-\u001f\u007f]/.test(value)
  );
}

export default class AuthStore {
  constructor(config, database) {
    this.config = config;
    this.database = database;
    this.state = null;
    this.saveLocal = null;
    this.backupTimer = null;
    this.backupQueue = Promise.resolve();
  }

  async hasLinkedSession() {
    try {
      const raw = await fs.promises.readFile(
        path.join(this.config.sessionDir, "creds.json"),
        "utf8",
      );
      const credentials = JSON.parse(raw, BufferJSON.reviver);
      return credentials?.registered === true;
    } catch {
      return false;
    }
  }

  async init() {
    await fs.promises.mkdir(this.config.sessionDir, {
      recursive: true,
      mode: 0o700,
    });

    if (!(await this.hasLinkedSession())) await this.restoreFromDatabase();

    const sessionCredential = consumeSessionCredential();
    if (!(await this.hasLinkedSession()) && sessionCredential) {
      const credentials = decodeSessionCredential(sessionCredential);
      await fs.promises.writeFile(
        path.join(this.config.sessionDir, "creds.json"),
        credentials,
        { mode: 0o600 },
      );
      logger.info("Imported a linked session from SESSION_ID");
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionDir);
    this.state = state;
    this.saveLocal = saveCreds;

    if (state.creds.registered) {
      logger.info({ namespace: this.config.sessionNamespace }, "Linked session ready");
      this.scheduleBackup();
    } else {
      logger.warn(
        { sessionSite: this.config.sessionSite },
        "No linked session found; add SESSION_ID from the pairing site",
      );
    }

    return {
      state,
      linked: state.creds.registered === true,
      saveCreds: () => this.saveCreds(),
    };
  }

  async saveCreds() {
    if (!this.saveLocal) return;
    await this.saveLocal();
    this.scheduleBackup();
  }

  async restoreFromDatabase() {
    const collection = this.database.collection("auth_sessions");
    if (!collection) return false;

    try {
      const document = await collection.findOne({
        _id: this.config.sessionNamespace,
      });
      if (!isRecord(document?.files)) return false;

      let total = 0;
      let restored = 0;
      for (const [filename, encoded] of Object.entries(document.files)) {
        if (!safeSessionFilename(filename) || typeof encoded !== "string") continue;
        const contents = Buffer.from(encoded, "base64");
        total += contents.length;
        if (total > MAX_BACKUP_BYTES) {
          throw new Error("stored session exceeds the 24 MB restore limit");
        }
        await fs.promises.writeFile(
          path.join(this.config.sessionDir, filename),
          contents,
          { mode: 0o600 },
        );
        restored += 1;
      }

      if (restored && (await this.hasLinkedSession())) {
        logger.info("Restored the linked session from MongoDB");
        return true;
      }
      return false;
    } catch (error) {
      logger.warn({ error: safeError(error) }, "Could not restore the MongoDB session backup");
      return false;
    }
  }

  scheduleBackup() {
    if (!this.database.collection("auth_sessions")) return;
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => {
      this.backupTimer = null;
      this.backupQueue = this.backupQueue
        .catch(() => {})
        .then(() => this.backupNow())
        .catch((error) =>
          logger.error({ error: safeError(error) }, "Session backup failed"),
        );
    }, 750);
    this.backupTimer.unref?.();
  }

  async backupNow() {
    const collection = this.database.collection("auth_sessions");
    if (!collection || !(await this.hasLinkedSession())) return;

    const files = {};
    let total = 0;
    for (const filename of await fs.promises.readdir(this.config.sessionDir)) {
      if (!safeSessionFilename(filename)) continue;
      const file = path.join(this.config.sessionDir, filename);
      const stat = await fs.promises.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) {
        continue;
      }
      total += stat.size;
      if (total > MAX_BACKUP_BYTES) {
        throw new Error("local session exceeds the 24 MB backup limit");
      }
      files[filename] = (await fs.promises.readFile(file)).toString("base64");
    }

    if (!Object.keys(files).length) return;
    await collection.updateOne(
      { _id: this.config.sessionNamespace },
      { $set: { files, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async clear() {
    clearTimeout(this.backupTimer);
    await fs.promises.rm(this.config.sessionDir, { recursive: true, force: true });
    await this.database
      .collection("auth_sessions")
      ?.deleteOne({ _id: this.config.sessionNamespace })
      .catch(() => {});
  }

  async close() {
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
      this.backupTimer = null;
      this.backupQueue = this.backupQueue
        .catch(() => {})
        .then(() => this.backupNow());
    }
    await this.backupQueue.catch(() => {});
  }
}

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { useMultiFileAuthState, BufferJSON } from "baileys";
import mongoose from "mongoose";
import { sessionSchema } from "./Schema/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All local sessions live under System/session/<sessionId>/
const SESSION_BASE_DIR = path.join(__dirname, "..", "session");
const MAX_CREDENTIAL_BASE64_BYTES = 2 * 1024 * 1024;
const MAX_CREDENTIAL_JSON_BYTES = 1024 * 1024;

const mongoReady = () => mongoose.connection.readyState === 1;

const isRecord = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const isKeyBytes = (value, length) =>
  Buffer.isBuffer(value) && value.length === length;
const isKeyPair = (value) =>
  isRecord(value) &&
  isKeyBytes(value.private, 32) &&
  isKeyBytes(value.public, 32);

/**
 * Decode and strictly validate the long creds.json value returned by VENOM's
 * existing external session site. The short one-time token flow will replace
 * this transport later; keeping this decoder isolated makes that swap safe.
 */
export const decodeSessionCredential = (value) => {
  const encoded = String(value || "").trim();
  if (!encoded) return null;
  if (encoded.length > MAX_CREDENTIAL_BASE64_BYTES) {
    throw new Error("session credential exceeds the 2 MB safety limit");
  }
  if (
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  ) {
    throw new Error("session credential is not canonical base64");
  }

  const decoded = Buffer.from(encoded, "base64");
  if (!decoded.length || decoded.length > MAX_CREDENTIAL_JSON_BYTES) {
    throw new Error("decoded session credential has an invalid size");
  }

  let creds;
  try {
    creds = JSON.parse(decoded.toString("utf8"), BufferJSON.reviver);
  } catch {
    throw new Error("session credential is not valid creds.json data");
  }

  const valid =
    isRecord(creds) &&
    creds.registered === true &&
    Number.isSafeInteger(creds.registrationId) &&
    isKeyPair(creds.noiseKey) &&
    isKeyPair(creds.signedIdentityKey) &&
    isRecord(creds.signedPreKey) &&
    isKeyPair(creds.signedPreKey.keyPair) &&
    isKeyBytes(creds.signedPreKey.signature, 64) &&
    Number.isSafeInteger(creds.signedPreKey.keyId) &&
    typeof creds.advSecretKey === "string" &&
    creds.advSecretKey.length >= 32 &&
    isRecord(creds.me) &&
    /@(s\.whatsapp\.net|lid)$/.test(String(creds.me.id || ""));

  if (!valid) {
    throw new Error("session credential is incomplete or not linked");
  }

  return `${JSON.stringify(creds, BufferJSON.replacer)}\n`;
};

const LEGACY_KEY_TYPE_MAP = {
  preKeys: "pre-key",
  sessions: "session",
  senderKeys: "sender-key",
  appStateSyncKeys: "app-state-sync-key",
  appStateVersions: "app-state-sync-version",
  senderKeyMemory: "sender-key-memory",
};

export const isSafeSessionFilename = (value) => {
  if (typeof value !== "string" || value.length < 6 || value.length > 240) {
    return false;
  }
  return (
    value.endsWith(".json") &&
    path.basename(value) === value &&
    !/[\\/\u0000-\u001f\u007f]/.test(value)
  );
};

const legacyKeyFilename = (type, id) => {
  const safeId = String(id).replace(/[\\/]/g, "__").replace(/:/g, "-");
  const filename = `${type}-${safeId}.json`;
  return isSafeSessionFilename(filename) ? filename : null;
};

export default class MongoAuth {
  /**
   * @param {string} sessionId local/Mongo namespace
   * @param {{credential?: string}} options external site's long credential
   */
  constructor(sessionId, { credential = "" } = {}) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)) {
      throw new Error(
        "SESSION_NAMESPACE must contain only letters, numbers, underscores, or hyphens.",
      );
    }
    this.sessionId = sessionId;
    this.sessionCredential = String(credential || "").trim();
    this.dir = path.join(SESSION_BASE_DIR, sessionId);
  }

  /**
   * Initialize auth state using local → MongoDB → external credential priority.
   * Returns { state, saveCreds, clearState } for makeWASocket.
   */
  async init() {
    console.log(`[ VENOM ] Starting session: "${this.sessionId}"`);

    const localExists = await this._localExists();

    if (!localExists) {
      const mongoExists = await this._mongoExists();
      if (mongoExists) {
        console.log(
          `[ VENOM ] [${this.sessionId}] Session not found locally — downloading from MongoDB...`,
        );

        try {
          await this._downloadToLocal();
        } catch (err) {
          console.error(
            `[ EXCEPTION ] [${this.sessionId}] Session download failed: ${err.message} — wiping partial files.`,
          );
          await fs.promises.rm(this.dir, { recursive: true, force: true });
        }

        const downloadOk = await this._localExists();
        if (downloadOk) {
          console.log(
            `[ VENOM ] [${this.sessionId}] Session restored from MongoDB ✓`,
          );
        } else {
          console.warn(
            `[ VENOM ] [${this.sessionId}] Stored session was incomplete; it was removed.`,
          );
          await fs.promises.rm(this.dir, { recursive: true, force: true });
        }
      }
    } else {
      console.log(`[ VENOM ] [${this.sessionId}] Local session found ✓`);
    }

    try {
      if (!(await this._localExists()) && this.sessionCredential) {
        await this._importSessionCredential(this.sessionCredential);
        console.log(
          `[ VENOM ] [${this.sessionId}] Session imported from the external VENOM session site ✓`,
        );
      }
    } finally {
      // Do not retain the external credential longer than initial import.
      this.sessionCredential = "";
    }

    if (!(await this._localExists())) {
      console.warn(
        `[ VENOM ] [${this.sessionId}] No linked session found. Use the external VENOM session site and configure SESSION_ID.`,
      );
    }

    await fs.promises.mkdir(this.dir, { recursive: true, mode: 0o700 });

    const { state, saveCreds: saveCredsLocal } = await useMultiFileAuthState(
      this.dir,
    );

    const saveCreds = async () => {
      await saveCredsLocal();
      await this.pushToMongoDB().catch((err) =>
        console.error(
          `[ EXCEPTION ] MongoDB session sync error: ${err.message}`,
        ),
      );
    };

    const clearState = async () => {
      await this._clearSession();
    };

    return { state, saveCreds, clearState };
  }

  /**
   * Push all local session files to MongoDB.
   * Called by the periodic background sync (GC interval).
   */
  async pushToMongoDB() {
    if (!mongoReady()) return;

    const localExists = await this._localExists();
    if (!localExists) return;

    let entries;
    try {
      entries = await fs.promises.readdir(this.dir);
    } catch {
      return;
    }

    const files = {};
    let totalBytes = 0;
    for (const entry of entries) {
      if (!isSafeSessionFilename(entry)) continue;
      const filePath = path.join(this.dir, entry);
      try {
        const stat = await fs.promises.lstat(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) {
          continue;
        }
        totalBytes += stat.size;
        if (totalBytes > 25 * 1024 * 1024) {
          throw new Error("Session backup exceeds the 25 MB safety limit.");
        }
        const content = await fs.promises.readFile(filePath);
        files[entry] = content.toString("base64");
      } catch (error) {
        if (error.message.includes("25 MB")) throw error;
        // Skip unreadable or invalid session files.
      }
    }

    if (Object.keys(files).length === 0) return;

    await sessionSchema.updateOne(
      { sessionId: this.sessionId },
      { $set: { files, lastSync: new Date() } },
      { upsert: true },
    );
  }

  async _importSessionCredential(credential) {
    const contents = decodeSessionCredential(credential);
    if (!contents) throw new Error("external session credential is empty");

    await fs.promises.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const destination = path.join(this.dir, "creds.json");
    const temporary = path.join(this.dir, `.creds-${randomUUID()}.tmp`);
    try {
      await fs.promises.writeFile(temporary, contents, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await fs.promises.rename(temporary, destination);
    } finally {
      await fs.promises.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async _localExists() {
    const credsPath = path.join(this.dir, "creds.json");
    try {
      await fs.promises.access(credsPath);
      return true;
    } catch {
      return false;
    }
  }

  async _mongoExists() {
    if (!mongoReady()) return false;
    try {
      const doc = await sessionSchema.findOne({ sessionId: this.sessionId });
      if (!doc) return false;
      if (
        doc.files &&
        Object.keys(doc.files).some(
          (k) => doc.files[k] && doc.files[k].length > 0,
        )
      )
        return true;
      if (doc.session && doc.session.length > 0) return true;
      return false;
    } catch {
      return false;
    }
  }

  async _downloadToLocal() {
    if (!mongoReady()) return;
    const doc = await sessionSchema.findOne({ sessionId: this.sessionId });
    if (!doc) return;

    if (doc.session && !doc.files) {
      await this._migrateLegacySession(doc.session);
      return;
    }

    if (!doc.files) return;
    await fs.promises.mkdir(this.dir, { recursive: true, mode: 0o700 });
    let totalBytes = 0;
    for (const [filename, base64Content] of Object.entries(doc.files)) {
      if (!isSafeSessionFilename(filename)) continue;
      if (
        typeof base64Content !== "string" ||
        base64Content.length === 0 ||
        base64Content.length > 2_796_208 ||
        base64Content.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Content)
      ) {
        continue;
      }
      const content = Buffer.from(base64Content, "base64");
      totalBytes += content.length;
      if (content.length > 2 * 1024 * 1024 || totalBytes > 25 * 1024 * 1024) {
        throw new Error("Stored session exceeds the restore safety limit.");
      }
      const filePath = path.join(this.dir, filename);
      await fs.promises.writeFile(filePath, content, { mode: 0o600 });
    }
  }

  /**
   * Convert the old single-blob session format into individual files that
   * useMultiFileAuthState can read, then push the new format to MongoDB.
   * @param {string} legacySessionString  The old `session` field value
   */
  async _migrateLegacySession(legacySessionString) {
    let parsed;
    try {
      parsed = JSON.parse(legacySessionString, BufferJSON.reviver);
    } catch (err) {
      console.error(
        `[ EXCEPTION ] Failed to parse legacy session blob: ${err.message}`,
      );
      return;
    }

    await fs.promises.mkdir(this.dir, { recursive: true, mode: 0o700 });

    // Write creds.json
    if (parsed.creds) {
      await fs.promises.writeFile(
        path.join(this.dir, "creds.json"),
        JSON.stringify(parsed.creds, BufferJSON.replacer),
        { mode: 0o600 },
      );
    }

    const keys = parsed.keys || {};
    for (const [storageKey, baileyType] of Object.entries(
      LEGACY_KEY_TYPE_MAP,
    )) {
      const keyData = keys[storageKey];
      if (!keyData || typeof keyData !== "object") continue;
      for (const [id, value] of Object.entries(keyData)) {
        const filename = legacyKeyFilename(baileyType, id);
        if (!filename) continue;
        await fs.promises.writeFile(
          path.join(this.dir, filename),
          JSON.stringify(value, BufferJSON.replacer),
          { mode: 0o600 },
        );
      }
    }

    console.log(`[ VENOM ] Legacy session migrated to new file-based format.`);

    await this.pushToMongoDB();
  }

  async _clearSession() {
    await fs.promises.rm(this.dir, { recursive: true, force: true });

    if (mongoReady()) {
      try {
        await sessionSchema.deleteOne({ sessionId: this.sessionId });
      } catch {
        // local is already cleared
      }
    }

    console.log(
      `[ VENOM ] Session cleared from local storage${mongoReady() ? " and MongoDB" : ""}.`,
    );
  }
}

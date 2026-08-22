import { logger, safeError } from "./logger.js";
import { extractUrls, isOwnerJid, jidNumber, normalizeJid, sameParticipant } from "./utils.js";

async function resolveOwner(socket, sender, owners, fromMe) {
  if (fromMe || isOwnerJid(sender, owners)) return true;
  if (!sender.endsWith("@lid")) return false;
  try {
    const phoneJid = await socket.signalRepository?.lidMapping?.getPNForLID?.(sender);
    return isOwnerJid(phoneJid, owners);
  } catch {
    return false;
  }
}

function findParticipant(metadata, jid) {
  return metadata?.participants?.find((participant) => sameParticipant(participant, jid));
}

export default class CommandRouter {
  constructor({ config, store, runtime, ai, requestRestart }) {
    this.config = config;
    const { databaseUrl: _databaseUrl, geminiKey: _geminiKey, ...commandConfig } = config;
    this.commandConfig = Object.freeze(commandConfig);
    this.store = store;
    this.runtime = runtime;
    this.ai = ai;
    this.requestRestart = requestRestart;
    this.commands = new Map();
    this.canonical = [];
  }

  register(commands) {
    for (const command of commands) {
      const name = String(command.name || "").toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) {
        throw new Error(`Invalid command name: ${name || "(empty)"}`);
      }
      if (this.commands.has(name)) throw new Error(`Duplicate command: ${name}`);
      const normalized = {
        aliases: [],
        category: "general",
        description: "No description provided.",
        usage: "",
        ...command,
        name,
      };
      this.commands.set(name, normalized);
      this.canonical.push(normalized);
      for (const alias of normalized.aliases) {
        const key = String(alias).toLowerCase();
        if (this.commands.has(key)) throw new Error(`Duplicate command alias: ${key}`);
        this.commands.set(key, normalized);
      }
    }
  }

  list() {
    return [...this.canonical].sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  }

  find(name) {
    return this.commands.get(String(name || "").toLowerCase());
  }

  async handle(socket, details) {
    if (details.isStatus) return false;

    const isOwner = await resolveOwner(
      socket,
      details.sender,
      this.config.owners,
      details.fromMe,
    );
    let metadata = null;
    let senderParticipant = null;
    let botParticipant = null;

    const getMetadata = async () => {
      if (!details.isGroup) return null;
      if (!metadata) {
        metadata = await socket.groupMetadata(details.chat);
        senderParticipant = findParticipant(metadata, details.sender);
        botParticipant = findParticipant(metadata, socket.user?.id);
      }
      return metadata;
    };

    if (details.isGroup && extractUrls(details.text).length) {
      await getMetadata().catch(() => null);
      const isAdmin = Boolean(senderParticipant?.admin);
      await this.moderateLinks(socket, details, { isOwner, isAdmin });
      if (!["off"].includes(this.store.group(details.chat).antiLink) && !isOwner && !isAdmin) {
        return true;
      }
    }

    const prefix = this.store.prefix;
    if (!details.text.startsWith(prefix)) return false;
    const body = details.text.slice(prefix.length).trim();
    if (!body) return false;
    const [name, ...args] = body.split(/\s+/);
    const command = this.find(name);
    if (!command) return false;
    if (this.store.mode === "private" && !isOwner) return true;

    if (details.isGroup && (command.groupOnly || command.adminOnly || command.botAdmin)) {
      await getMetadata();
    }

    const isAdmin = Boolean(senderParticipant?.admin) || isOwner;
    const botAdmin = Boolean(botParticipant?.admin);
    const context = {
      socket,
      message: details.raw,
      details,
      chat: details.chat,
      sender: details.sender,
      senderNumber: jidNumber(details.sender),
      args,
      query: args.join(" ").trim(),
      prefix,
      command,
      config: this.commandConfig,
      store: this.store,
      runtime: this.runtime,
      registry: this,
      ai: this.ai,
      metadata,
      isOwner,
      isAdmin,
      botAdmin,
      reply: (text, options = {}) =>
        socket.sendMessage(
          details.chat,
          { text: String(text), ...options },
          { quoted: details.raw },
        ),
      send: (content, options = {}) =>
        socket.sendMessage(details.chat, content, options),
      react: (emoji) =>
        socket.sendMessage(details.chat, {
          react: { text: emoji, key: details.raw.key },
        }),
      targetJid: () => {
        const selected = details.mentionedJids[0] || details.quotedSender;
        if (selected) return normalizeJid(selected);
        const number = String(args[0] || "").replace(/\D/g, "");
        return number.length >= 7 && number.length <= 15
          ? `${number}@s.whatsapp.net`
          : "";
      },
    };

    if (command.ownerOnly && !isOwner) {
      await context.reply("⛔ This command is only available to the bot owner.");
      return true;
    }
    if (command.groupOnly && !details.isGroup) {
      await context.reply("👥 This command can only be used in a group.");
      return true;
    }
    if (command.adminOnly && !isAdmin) {
      await context.reply("🛡️ Only group admins can use this command.");
      return true;
    }
    if (command.botAdmin && !botAdmin) {
      await context.reply("⚠️ Make me a group admin first.");
      return true;
    }

    try {
      if (this.config.commandReact) await context.react("⚡").catch(() => {});
      await command.execute(context);
    } catch (error) {
      logger.error(
        { command: command.name, error: safeError(error) },
        "Command failed",
      );
      await context.reply(`❌ ${safeError(error)}`).catch(() => {});
    }
    return true;
  }

  async moderateLinks(socket, details, { isOwner, isAdmin }) {
    const setting = this.store.group(details.chat).antiLink;
    if (setting === "off" || isOwner || isAdmin) return;

    await socket.sendMessage(details.chat, { delete: details.raw.key }).catch(() => {});
    if (setting === "delete") return;

    if (setting === "kick") {
      await socket.groupParticipantsUpdate(details.chat, [details.sender], "remove");
      return;
    }

    const warnings = await this.store.warn(details.chat, details.sender);
    if (warnings >= 3) {
      await socket.groupParticipantsUpdate(details.chat, [details.sender], "remove");
      await this.store.clearWarning(details.chat, details.sender);
      return;
    }
    await socket.sendMessage(details.chat, {
      text: `⚠️ @${jidNumber(details.sender)}, links are not allowed. Warning ${warnings}/3.`,
      mentions: [details.sender],
    });
  }
}

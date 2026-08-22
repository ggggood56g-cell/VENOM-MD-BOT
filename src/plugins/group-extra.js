import { jidNumber } from "../utils.js";

const settingCommand = (name, setting, message) => ({
  name,
  category: "group",
  description: message,
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async execute(context) {
    await context.socket.groupSettingUpdate(context.chat, setting);
    await context.reply(`✅ ${message}`);
  },
});

export default [
  settingCommand("lock", "announcement", "Group locked; only admins can send messages."),
  settingCommand("mute", "announcement", "Group muted; only admins can send messages."),
  settingCommand("unlock", "not_announcement", "Group unlocked for member messages."),
  settingCommand("unmute", "not_announcement", "Group unmuted for member messages."),
  {
    name: "gcstatus",
    category: "group",
    description: "Show VENOM automation settings for this group.",
    groupOnly: true,
    async execute(context) {
      const settings = context.store.group(context.chat);
      await context.reply([
        `⚙️ *${context.metadata.subject}*`,
        `Anti-link: ${settings.antiLink}`,
        `Welcome: ${settings.welcome ? "on" : "off"}`,
        `Goodbye: ${settings.goodbye ? "on" : "off"}`,
        `Members: ${context.metadata.participants.length}`,
      ].join("\n"));
    },
  },
  {
    name: "events",
    category: "group",
    description: "Show group welcome, goodbye and anti-link settings.",
    groupOnly: true,
    execute: async (context) => {
      const settings = context.store.group(context.chat);
      await context.reply(`🎛️ *GROUP EVENTS*\nWelcome: ${settings.welcome ? "on" : "off"}\nGoodbye: ${settings.goodbye ? "on" : "off"}\nAnti-link: ${settings.antiLink}`);
    },
  },
  {
    name: "listadmin",
    category: "group",
    description: "List and mention group administrators.",
    groupOnly: true,
    async execute(context) {
      const admins = context.metadata.participants.filter((participant) => participant.admin).map((participant) => participant.id);
      await context.reply(`🛡️ *GROUP ADMINS*\n${admins.map((jid) => `• @${jidNumber(jid)}`).join("\n")}`, { mentions: admins });
    },
  },
  {
    name: "poll",
    category: "group",
    description: "Create a WhatsApp group poll.",
    usage: "poll Question | Option 1 | Option 2",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const [name, ...values] = context.query.split("|").map((value) => value.trim()).filter(Boolean);
      if (!name || values.length < 2 || values.length > 12) throw new Error("Use a question and 2–12 options separated by |.");
      await context.send({ poll: { name: name.slice(0, 255), values: values.map((value) => value.slice(0, 100)), selectableCount: 1 } });
    },
  },
  {
    name: "invite",
    category: "group",
    description: "Get the group invite link.",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const code = await context.socket.groupInviteCode(context.chat);
      await context.reply(`🔗 https://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: "reset",
    category: "group",
    description: "Reset the group invite link.",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      await context.socket.groupRevokeInvite(context.chat);
      await context.reply("✅ Group invite link reset.");
    },
  },
  {
    name: "gdesc",
    category: "group",
    description: "Show the current group description.",
    groupOnly: true,
    async execute(context) {
      await context.reply(`📝 *${context.metadata.subject}*\n${context.metadata.desc || "No group description."}`);
    },
  },
  {
    name: "gpp",
    category: "group",
    description: "Show the current group profile photo.",
    groupOnly: true,
    async execute(context) {
      const url = await context.socket.profilePictureUrl(context.chat, "image").catch(() => "");
      if (!url) throw new Error("This group has no visible profile photo.");
      await context.send({ image: { url }, caption: context.metadata.subject });
    },
  },
  {
    name: "warnlist",
    category: "group",
    description: "Show current warning counts in this group.",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const warnings = Object.entries(context.store.state.warnings[context.chat] || {}).filter(([, count]) => count > 0);
      await context.reply(`⚠️ *WARNINGS*\n${warnings.map(([jid, count]) => `• @${jidNumber(jid)} — ${count}/3`).join("\n") || "No active warnings."}`, { mentions: warnings.map(([jid]) => jid) });
    },
  },
  {
    name: "unwarn",
    category: "group",
    description: "Clear all warnings for a mentioned user.",
    usage: "unwarn @user",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention or quote a user.");
      await context.store.clearWarning(context.chat, target);
      await context.reply(`✅ Warnings cleared for @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "vcf",
    category: "group",
    description: "Export group members as a VCF contact file.",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const contacts = context.metadata.participants.slice(0, 1_000).map((participant, index) => {
        const number = jidNumber(participant.id);
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${context.config.botName} Member ${index + 1}\nTEL;TYPE=CELL:+${number}\nEND:VCARD`;
      }).join("\n");
      await context.send({ document: Buffer.from(contacts), mimetype: "text/vcard", fileName: `${context.metadata.subject.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 50)}.vcf`, caption: `${context.metadata.participants.length} group contacts` });
    },
  },
  {
    name: "join",
    category: "group",
    description: "Join a group using an invite link (owner only).",
    usage: "join https://chat.whatsapp.com/code",
    ownerOnly: true,
    async execute(context) {
      const code = context.query.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/)?.[1];
      if (!code) throw new Error("Enter a valid WhatsApp group invite link.");
      const jid = await context.socket.groupAcceptInvite(code);
      await context.reply(`✅ Joined group: ${jid}`);
    },
  },
  {
    name: "leave",
    category: "group",
    description: "Make the bot leave the current group (owner only).",
    groupOnly: true,
    ownerOnly: true,
    async execute(context) {
      await context.reply("👋 Leaving this group.");
      await context.socket.groupLeave(context.chat);
    },
  },
  {
    name: "creategc",
    category: "group",
    description: "Create a group with mentioned users (owner only).",
    usage: "creategc Group Name @user",
    ownerOnly: true,
    async execute(context) {
      const participants = context.details.mentionedJids;
      const name = context.query.replace(/@\d+/g, "").trim().slice(0, 100);
      if (!name || !participants.length) throw new Error("Enter a group name and mention at least one user.");
      const result = await context.socket.groupCreate(name, participants);
      await context.reply(`✅ Group created: ${result.gid || result.id || "success"}`);
    },
  },
];

import { inviteUrl, jidNumber } from "../utils.js";

function requireTarget(context) {
  const target = context.targetJid();
  if (!target) throw new Error("Mention, quote or enter a phone number.");
  return target;
}

async function participantAction(context, action, success) {
  const target = requireTarget(context);
  const result = await context.socket.groupParticipantsUpdate(
    context.chat,
    [target],
    action,
  );
  const code = Number(result?.[0]?.status || 200);
  if (code >= 400) throw new Error(`WhatsApp rejected the action (${code}).`);
  await context.reply(`${success} @${jidNumber(target)}`, { mentions: [target] });
}

export default [
  {
    name: "groupinfo",
    aliases: ["ginfo"],
    category: "group",
    description: "Show information about this group.",
    groupOnly: true,
    async execute(context) {
      const admins = context.metadata.participants.filter((item) => item.admin).length;
      await context.reply(
        [
          `*${context.metadata.subject}*`,
          `Members: ${context.metadata.participants.length}`,
          `Admins: ${admins}`,
          `Created: ${context.metadata.creation ? new Date(context.metadata.creation * 1000).toLocaleDateString("en-NG") : "Unknown"}`,
          `Description: ${context.metadata.desc || "None"}`,
        ].join("\n"),
      );
    },
  },
  {
    name: "admins",
    category: "group",
    description: "Mention all group admins.",
    groupOnly: true,
    async execute(context) {
      const admins = context.metadata.participants.filter((item) => item.admin).map((item) => item.id);
      await context.reply(
        `🛡️ *Group admins*\n${admins.map((jid) => `• @${jidNumber(jid)}`).join("\n")}`,
        { mentions: admins },
      );
    },
  },
  {
    name: "tagall",
    category: "group",
    description: "Mention every group member with an optional message.",
    usage: "tagall [message]",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const members = context.metadata.participants.map((item) => item.id).slice(0, 500);
      const heading = context.query || "Attention everyone";
      await context.reply(
        `📢 *${heading}*\n\n${members.map((jid) => `• @${jidNumber(jid)}`).join("\n")}`,
        { mentions: members },
      );
    },
  },
  {
    name: "hidetag",
    aliases: ["htag"],
    category: "group",
    description: "Silently mention every group member.",
    usage: "hidetag <message>",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      if (!context.query) throw new Error("Enter a message to send.");
      const members = context.metadata.participants.map((item) => item.id).slice(0, 500);
      await context.reply(context.query, { mentions: members });
    },
  },
  ...["promote", "demote", "kick", "add"].map((name) => ({
    name,
    category: "group",
    description: `${name[0].toUpperCase()}${name.slice(1)} a group participant.`,
    usage: `${name} @user`,
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    execute: (context) =>
      participantAction(
        context,
        { promote: "promote", demote: "demote", kick: "remove", add: "add" }[name],
        { promote: "✅ Promoted", demote: "✅ Demoted", kick: "✅ Removed", add: "✅ Added" }[name],
      ),
  })),
  {
    name: "group",
    category: "group",
    description: "Open or close the group for member messages.",
    usage: "group open|close",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const action = context.args[0]?.toLowerCase();
      if (!["open", "close"].includes(action)) throw new Error("Use group open or group close.");
      await context.socket.groupSettingUpdate(
        context.chat,
        action === "open" ? "not_announcement" : "announcement",
      );
      await context.reply(`✅ Group ${action === "open" ? "opened" : "closed"}.`);
    },
  },
  {
    name: "grouplink",
    aliases: ["link"],
    category: "group",
    description: "Get the current group invite link.",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const code = await context.socket.groupInviteCode(context.chat);
      await context.reply(`🔗 ${inviteUrl(context.socket, code)}`);
    },
  },
  {
    name: "revoke",
    aliases: ["resetlink"],
    category: "group",
    description: "Revoke and replace the group invite link.",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      await context.socket.groupRevokeInvite(context.chat);
      await context.reply("✅ The old invite link has been revoked.");
    },
  },
  {
    name: "subject",
    aliases: ["setsubject", "groupname"],
    category: "group",
    description: "Change the group subject.",
    usage: "subject <new name>",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      if (!context.query || context.query.length > 100) throw new Error("Enter a subject up to 100 characters.");
      await context.socket.groupUpdateSubject(context.chat, context.query);
      await context.reply("✅ Group subject updated.");
    },
  },
  {
    name: "description",
    aliases: ["setdesc", "desc"],
    category: "group",
    description: "Change the group description.",
    usage: "description <new description>",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      if (!context.query || context.query.length > 500) throw new Error("Enter a description up to 500 characters.");
      await context.socket.groupUpdateDescription(context.chat, context.query);
      await context.reply("✅ Group description updated.");
    },
  },
  {
    name: "antilink",
    category: "group",
    description: "Configure group link moderation.",
    usage: "antilink off|delete|warn|kick",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const action = context.args[0]?.toLowerCase();
      if (!["off", "delete", "warn", "kick"].includes(action)) {
        throw new Error("Use antilink off, delete, warn or kick.");
      }
      await context.store.setGroup(context.chat, { antiLink: action });
      await context.reply(`✅ Anti-link mode: *${action}*.`);
    },
  },
  ...["welcome", "goodbye"].map((name) => ({
    name,
    category: "group",
    description: `Enable or disable ${name} messages.`,
    usage: `${name} on|off`,
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const enabled = context.args[0]?.toLowerCase();
      if (!["on", "off"].includes(enabled)) throw new Error(`Use ${name} on or ${name} off.`);
      await context.store.setGroup(context.chat, { [name]: enabled === "on" });
      await context.reply(`✅ ${name[0].toUpperCase()}${name.slice(1)} messages ${enabled}.`);
    },
  })),
  ...[
    ["setwelcome", "welcomeText", "Welcome @user to *{group}*!"],
    ["setgoodbye", "goodbyeText", "Goodbye @user from *{group}*."],
  ].map(([name, key, example]) => ({
    name,
    category: "group",
    description: `Customize the group ${key === "welcomeText" ? "welcome" : "goodbye"} message.`,
    usage: `${name} <text>`,
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      if (!context.query || context.query.length > 500) {
        throw new Error(`Enter text up to 500 characters. Example: ${example}`);
      }
      await context.store.setGroup(context.chat, { [key]: context.query });
      await context.reply("✅ Custom message saved. Use @user and {group} as placeholders.");
    },
  })),
  {
    name: "warn",
    category: "group",
    description: "Warn a member; the third warning removes them.",
    usage: "warn @user",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const target = requireTarget(context);
      const count = await context.store.warn(context.chat, target);
      if (count >= 3) {
        await context.socket.groupParticipantsUpdate(context.chat, [target], "remove");
        await context.store.clearWarning(context.chat, target);
        await context.reply(`🚫 @${jidNumber(target)} reached three warnings and was removed.`, { mentions: [target] });
      } else {
        await context.reply(`⚠️ @${jidNumber(target)} warning ${count}/3.`, { mentions: [target] });
      }
    },
  },
  {
    name: "resetwarn",
    category: "group",
    description: "Clear a member's warnings.",
    usage: "resetwarn @user",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const target = requireTarget(context);
      await context.store.clearWarning(context.chat, target);
      await context.reply(`✅ Warnings cleared for @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
];

import { jidNumber } from "../utils.js";

function toggle(context) {
  const value = context.args[0]?.toLowerCase();
  if (!["on", "off"].includes(value)) {
    throw new Error(`Use ${context.prefix}${context.command.name} on or off.`);
  }
  return value === "on";
}

function requireTarget(context) {
  const target = context.targetJid();
  if (!target) throw new Error("Mention or quote a group member.");
  return target;
}

export default [
  ...[
    ["antibot", "antiBot"],
    ["antispam", "antiSpam"],
    ["antitag", "antiTag"],
  ].map(([name, setting]) => ({
    name,
    category: "group",
    description: `Turn ${name} moderation on or off.`,
    usage: `${name} on|off`,
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const enabled = toggle(context);
      await context.store.setGroup(context.chat, { [setting]: enabled });
      await context.reply(`✅ ${name}: *${enabled ? "on" : "off"}*`);
    },
  })),
  {
    name: "antiword",
    category: "group",
    description: "Manage blocked words for this group.",
    usage: "antiword add|del|list|off <word>",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const action = context.args.shift()?.toLowerCase();
      const word = context.args.join(" ").trim().toLowerCase();
      const settings = context.store.group(context.chat);
      const words = new Set(settings.antiWords);
      if (action === "list") {
        await context.reply(`🚫 *BLOCKED WORDS*\n${[...words].join("\n") || "None"}`);
        return;
      }
      if (action === "off") words.clear();
      else if (action === "add" && word) words.add(word);
      else if (action === "del" && word) words.delete(word);
      else throw new Error(`Use: ${context.prefix}antiword add|del|list|off <word>`);
      await context.store.setGroup(context.chat, { antiWords: [...words] });
      await context.reply(`✅ Blocked-word list updated (${words.size}).`);
    },
  },
  ...["antigcstatus", "antigm"].map((name) => ({
    name,
    category: "group",
    description: "Enable or disable VENOM group event messages.",
    usage: `${name} on|off`,
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const enabled = toggle(context);
      // “anti” on means suppress event messages.
      await context.store.setGroup(context.chat, { events: !enabled });
      await context.reply(`✅ ${name}: *${enabled ? "on" : "off"}*`);
    },
  })),
  {
    name: "akick",
    category: "group",
    description: "Remove a mentioned group member.",
    usage: "akick @user",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const target = requireTarget(context);
      await context.socket.groupParticipantsUpdate(context.chat, [target], "remove");
      await context.reply(`✅ Removed @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "kickr",
    category: "group",
    description: "Remove the sender of a quoted message.",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const target = context.details.quotedSender;
      if (!target) throw new Error("Reply to a member's message.");
      await context.socket.groupParticipantsUpdate(context.chat, [target], "remove");
      await context.reply(`✅ Removed @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "tkick",
    category: "group",
    description: "Remove then re-add a member after ten seconds.",
    usage: "tkick @user",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      const target = requireTarget(context);
      await context.socket.groupParticipantsUpdate(context.chat, [target], "remove");
      setTimeout(() => {
        void context.socket.groupParticipantsUpdate(context.chat, [target], "add").catch(() => {});
      }, 10_000).unref?.();
      await context.reply(`⏳ Temporarily removed @${jidNumber(target)} for 10 seconds.`, { mentions: [target] });
    },
  },
  {
    name: "tag",
    category: "group",
    description: "Mention all group members with a short message.",
    usage: "tag <message>",
    groupOnly: true,
    adminOnly: true,
    async execute(context) {
      const members = context.metadata.participants.map((participant) => participant.id).slice(0, 500);
      await context.reply(context.query || "📢 Attention everyone", { mentions: members });
    },
  },
  {
    name: "gname",
    category: "group",
    description: "Change the group name.",
    usage: "gname <new name>",
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    async execute(context) {
      if (!context.query || context.query.length > 100) throw new Error("Enter a group name up to 100 characters.");
      await context.socket.groupUpdateSubject(context.chat, context.query);
      await context.reply("✅ Group name updated.");
    },
  },
  {
    name: "kickall",
    category: "group",
    description: "Remove all non-admin members after explicit owner confirmation.",
    usage: "kickall CONFIRM",
    groupOnly: true,
    ownerOnly: true,
    botAdmin: true,
    async execute(context) {
      if (context.args[0] !== "CONFIRM") throw new Error(`This is destructive. Use exactly: ${context.prefix}kickall CONFIRM`);
      const targets = context.metadata.participants
        .filter((participant) => !participant.admin && participant.id !== context.socket.user?.id)
        .map((participant) => participant.id)
        .slice(0, 500);
      for (let index = 0; index < targets.length; index += 20) {
        await context.socket.groupParticipantsUpdate(context.chat, targets.slice(index, index + 20), "remove");
      }
      await context.reply(`✅ Removed ${targets.length} non-admin member(s).`);
    },
  },
];

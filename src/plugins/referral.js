import { jidNumber } from "../utils.js";

const REWARD_DEFAULT = 500;

function codeFor(jid) {
  return String(jidNumber(jid) || "user").slice(-6);
}
void codeFor;

export default [
  {
    name: "ref",
    category: "economy",
    description: "Show your referral link or credit a referral.",
    usage: "ref [friend code]",
    async execute(context) {
      const mine = context.store.referral(context.sender);
      if (!context.query) {
        const botNumber = jidNumber(context.socket?.user?.id || "");
        await context.reply(
          [
            "👥 *REFERRAL PROGRAMME*",
            `Your code: *${mine.code}*`,
            `Share: https://wa.me/${botNumber}?text=${encodeURIComponent(`${context.prefix}ref ${mine.code}`)}`,
            "",
            `Invites: ${mine.invites} • Earned: ${mine.earned.toLocaleString()} 🪙`,
            `Friends use: ${context.prefix}ref <your code>`,
          ].join("\n"),
        );
        return;
      }
      const code = context.query.replace(/\D/g, "").slice(0, 6);
      if (!code) throw new Error("Send a 6-digit referral code.");
      if (code === mine.code) throw new Error("You cannot refer yourself 😄");
      const owner = context.store.referralBoard().find((entry) => String(entry.code) === code);
      if (!owner) throw new Error("That referral code does not exist yet.");
      if (mine.referredBy) throw new Error("You already joined with a referral code.");
      const reward = Number(context.store.runtimeVar("affiliateReward")) || REWARD_DEFAULT;
      await context.store.setReferral(context.sender, { referredBy: owner.jid });
      await context.store.setReferral(owner.jid, {
        invites: Number(owner.invites) + 1,
        earned: Number(owner.earned || 0) + reward,
      });
      const account = context.store.economy(owner.jid);
      await context.store.updateEconomy(owner.jid, { ...account, wallet: account.wallet + reward });
      await context.reply(
        `🎉 Welcome! You joined with @${jidNumber(owner.jid)}'s referral code.\nThey earned ${reward.toLocaleString()} 🪙`,
        { mentions: [owner.jid] },
      );
    },
  },
  {
    name: "refstats",
    category: "economy",
    description: "Show your referral statistics.",
    async execute(context) {
      const mine = context.store.referral(context.sender);
      await context.reply(
        `👥 *YOUR REFERRALS*\nInvites: ${mine.invites}\nEarned: ${mine.earned.toLocaleString()} 🪙\nReferred by: ${mine.referredBy ? `@${jidNumber(mine.referredBy)}` : "nobody"}`,
        mine.referredBy ? { mentions: [mine.referredBy] } : {},
      );
    },
  },
  {
    name: "reftop",
    category: "economy",
    description: "Top inviters on this bot.",
    async execute(context) {
      const board = context.store.referralBoard().slice(0, 10);
      if (!board.length) {
        await context.reply("👥 No referrals yet. Be the first with *.ref*");
        return;
      }
      await context.reply(
        `🏆 *TOP INVITERS*\n${board.map((entry, index) => `${index + 1}. @${jidNumber(entry.jid)} — ${entry.invites} invites (${Number(entry.earned || 0).toLocaleString()} 🪙)`).join("\n")}`,
        { mentions: board.map((entry) => entry.jid) },
      );
    },
  },
  {
    name: "affiliate",
    category: "economy",
    description: "Show the affiliate reward per invite.",
    async execute(context) {
      const reward = Number(context.store.runtimeVar("affiliateReward")) || REWARD_DEFAULT;
      await context.reply(`💰 Affiliate reward: *${reward.toLocaleString()} 🪙* per confirmed invite.`);
    },
  },
  {
    name: "steak",
    category: "economy",
    description: "Grill a steak and earn some coins.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const now = Date.now();
      if (now - Number(account.cooldowns.steak || 0) < 60 * 60_000) {
        const minutes = Math.ceil((60 * 60_000 - (now - Number(account.cooldowns.steak))) / 60_000);
        throw new Error(`🥩 The grill is still hot. Try again in ${minutes} minute(s).`);
      }
      const doneness = ["rare", "medium", "well-done"][Math.floor(Math.random() * 3)];
      const reward = 120 + Math.floor(Math.random() * 480);
      await context.store.updateEconomy(context.sender, {
        ...account,
        wallet: account.wallet + reward,
        cooldowns: { ...account.cooldowns, steak: now },
      });
      await context.reply(`🥩 You grilled a *${doneness}* steak and sold it for ${reward.toLocaleString()} 🪙`);
    },
  },
  {
    name: "setaffiliate",
    category: "config",
    description: "Set the affiliate reward per invite (owner only).",
    usage: "setaffiliate <amount>",
    ownerOnly: true,
    async execute(context) {
      const amount = Number(context.args[0]);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
        throw new Error("Enter an amount between 1 and 1000000.");
      }
      await context.store.setRuntimeVar("affiliateReward", String(Math.floor(amount)));
      await context.reply(`✅ Affiliate reward set to ${Math.floor(amount).toLocaleString()} 🪙`);
    },
  },
];

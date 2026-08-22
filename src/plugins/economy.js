import { jidNumber, randomItem } from "../utils.js";

const SHOP = Object.freeze({
  fishingrod: { price: 1_500, sell: 900, description: "Improves fishing rewards." },
  pickaxe: { price: 2_000, sell: 1_200, description: "Improves mining rewards." },
  rifle: { price: 2_500, sell: 1_500, description: "Improves hunting rewards." },
  shield: { price: 5_000, sell: 3_000, description: "Reduces successful robbery losses." },
  luckycoin: { price: 10_000, sell: 6_000, description: "A collectible symbol of good luck." },
});

const money = (value) => `${Math.floor(Number(value) || 0).toLocaleString()} coins`;

function amountFrom(context, index = 0) {
  const raw = context.args[index];
  const account = context.store.economy(context.sender);
  if (String(raw).toLowerCase() === "all") return account.wallet;
  const amount = Math.floor(Number(String(raw || "").replace(/,/g, "")));
  if (!Number.isFinite(amount) || amount < 1) throw new Error("Enter a valid amount greater than zero.");
  return amount;
}

async function earnWithCooldown(context, name, cooldownMs, minimum, maximum, message) {
  const account = context.store.economy(context.sender);
  const now = Date.now();
  const readyAt = Number(account.cooldowns[name] || 0) + cooldownMs;
  if (readyAt > now) {
    const minutes = Math.ceil((readyAt - now) / 60_000);
    throw new Error(`Try ${name} again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
  let reward = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
  if (name === "fish" && account.inventory.fishingrod) reward = Math.round(reward * 1.5);
  if (name === "mine" && account.inventory.pickaxe) reward = Math.round(reward * 1.5);
  if (name === "hunt" && account.inventory.rifle) reward = Math.round(reward * 1.5);
  await context.store.updateEconomy(context.sender, (current) => ({
    ...current,
    wallet: current.wallet + reward,
    cooldowns: { ...current.cooldowns, [name]: now },
  }));
  await context.reply(`${message} You earned *${money(reward)}*.`);
}

function targetOrThrow(context) {
  const target = context.targetJid();
  if (!target || target === context.sender) throw new Error("Mention or quote another user.");
  return target;
}

export default [
  {
    name: "economy",
    aliases: ["econ"],
    category: "economy",
    description: "Show economy help and your current balance.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      await context.reply([
        "💰 *VENOM ECONOMY*",
        `Wallet: ${money(account.wallet)}`,
        `Bank: ${money(account.bank)} / ${money(account.bankLimit)}`,
        `Debt: ${money(account.debt)}`,
        "",
        `Earn: ${context.prefix}daily, work, beg, fish, hunt, mine, crime`,
        `Manage: ${context.prefix}deposit, withdraw, give, shop, buy, sell`,
        `Games: ${context.prefix}coinflip, gamble, blackjack, slots, rps`,
      ].join("\n"));
    },
  },
  {
    name: "balance",
    aliases: ["bal"],
    category: "economy",
    description: "Show your wallet and bank balance.",
    async execute(context) {
      const target = context.targetJid() || context.sender;
      const account = context.store.economy(target);
      await context.reply(`💳 *@${jidNumber(target)}*\nWallet: ${money(account.wallet)}\nBank: ${money(account.bank)}\nNet worth: ${money(account.wallet + account.bank - account.debt)}`, { mentions: [target] });
    },
  },
  {
    name: "daily",
    category: "economy",
    description: "Claim a daily reward and build a streak.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const now = Date.now();
      if (now - account.lastDaily < 20 * 60 * 60 * 1000) {
        const hours = Math.ceil((20 * 60 * 60 * 1000 - (now - account.lastDaily)) / 3_600_000);
        throw new Error(`Your next daily reward is available in about ${hours} hour(s).`);
      }
      const continued = now - account.lastDaily < 48 * 60 * 60 * 1000;
      const streak = continued ? account.streak + 1 : 1;
      const reward = 1_000 + Math.min(5_000, streak * 150);
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet + reward, streak, lastDaily: now });
      await context.reply(`🎁 Daily reward: *${money(reward)}*\n🔥 Streak: ${streak} day(s)`);
    },
  },
  {
    name: "streak",
    category: "economy",
    description: "Show your daily reward streak.",
    async execute(context) {
      await context.reply(`🔥 Daily streak: *${context.store.economy(context.sender).streak} day(s)*`);
    },
  },
  ...[
    ["work", 10 * 60_000, 250, 700, "🧰 Good work!"],
    ["beg", 5 * 60_000, 30, 180, "🙏 Someone helped you."],
    ["fish", 12 * 60_000, 100, 550, "🎣 You caught a good fish."],
    ["hunt", 15 * 60_000, 130, 650, "🏹 The hunt was successful."],
    ["mine", 15 * 60_000, 120, 700, "⛏️ You found valuable minerals."],
  ].map(([name, cooldown, min, max, message]) => ({
    name,
    category: "economy",
    description: `${name[0].toUpperCase()}${name.slice(1)} to earn coins.`,
    execute: (context) => earnWithCooldown(context, name, cooldown, min, max, message),
  })),
  {
    name: "crime",
    category: "economy",
    description: "Risk a fine for a chance at a larger reward.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const now = Date.now();
      if (now - Number(account.cooldowns.crime || 0) < 20 * 60_000) throw new Error("Wait 20 minutes between crime attempts.");
      const success = Math.random() < 0.52;
      const amount = success ? 500 + Math.floor(Math.random() * 1_500) : Math.min(account.wallet, 250 + Math.floor(Math.random() * 700));
      await context.store.updateEconomy(context.sender, {
        ...account,
        wallet: success ? account.wallet + amount : account.wallet - amount,
        cooldowns: { ...account.cooldowns, crime: now },
      });
      await context.reply(success ? `🕶️ You got away with *${money(amount)}*.` : `🚓 You were caught and fined *${money(amount)}*.`);
    },
  },
  {
    name: "deposit",
    aliases: ["dep"],
    category: "economy",
    description: "Move wallet coins into your bank.",
    usage: "deposit <amount|all>",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const amount = amountFrom(context);
      if (account.wallet < amount) throw new Error("Your wallet does not contain that much.");
      if (account.bank + amount > account.bankLimit) throw new Error("That amount exceeds your bank capacity.");
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet - amount, bank: account.bank + amount });
      await context.reply(`🏦 Deposited *${money(amount)}*.`);
    },
  },
  {
    name: "withdraw",
    aliases: ["with"],
    category: "economy",
    description: "Move bank coins into your wallet.",
    usage: "withdraw <amount|all>",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const raw = context.args[0];
      const amount = String(raw).toLowerCase() === "all" ? account.bank : amountFrom(context);
      if (account.bank < amount) throw new Error("Your bank does not contain that much.");
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet + amount, bank: account.bank - amount });
      await context.reply(`🏧 Withdrew *${money(amount)}*.`);
    },
  },
  {
    name: "give",
    aliases: ["gift"],
    category: "economy",
    description: "Give wallet coins to another user.",
    usage: "give @user <amount>",
    async execute(context) {
      const target = targetOrThrow(context);
      const amount = amountFrom(context, context.args.length - 1);
      await context.store.transferMoney(context.sender, target, amount);
      await context.reply(`🎁 Sent *${money(amount)}* to @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "leaderboard",
    aliases: ["rich"],
    category: "economy",
    description: "Show the richest VENOM economy users.",
    async execute(context) {
      const leaders = context.store.economyLeaders(10);
      await context.reply(`🏆 *ECONOMY LEADERBOARD*\n\n${leaders.map((item, index) => `${index + 1}. @${jidNumber(item.jid)} — ${money(item.total)}`).join("\n") || "No accounts yet."}`, { mentions: leaders.map((item) => item.jid) });
    },
  },
  {
    name: "networth",
    category: "economy",
    description: "Show total assets minus debt.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      await context.reply(`📈 Net worth: *${money(account.wallet + account.bank - account.debt)}*`);
    },
  },
  {
    name: "profile",
    category: "economy",
    description: "Show your economy profile.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      await context.reply([`👤 *@${jidNumber(context.sender)}*`, `Wallet: ${money(account.wallet)}`, `Bank: ${money(account.bank)}`, `Debt: ${money(account.debt)}`, `Daily streak: ${account.streak}`, `Inventory items: ${Object.values(account.inventory).reduce((sum, value) => sum + value, 0)}`].join("\n"), { mentions: [context.sender] });
    },
  },
  {
    name: "coinflip",
    category: "economy",
    description: "Bet coins on heads or tails.",
    usage: "coinflip heads <amount>",
    async execute(context) {
      const choice = context.args[0]?.toLowerCase();
      if (!["heads", "tails"].includes(choice)) throw new Error("Choose heads or tails, then enter an amount.");
      const amount = amountFrom(context, 1);
      const account = context.store.economy(context.sender);
      if (account.wallet < amount) throw new Error("You do not have enough coins.");
      const result = Math.random() < 0.5 ? "heads" : "tails";
      const won = choice === result;
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet + (won ? amount : -amount) });
      await context.reply(`🪙 ${result.toUpperCase()}! You ${won ? "won" : "lost"} *${money(amount)}*.`);
    },
  },
  {
    name: "gamble",
    category: "economy",
    description: "Risk coins for a random multiplier.",
    usage: "gamble <amount>",
    async execute(context) {
      const amount = amountFrom(context);
      const account = context.store.economy(context.sender);
      if (account.wallet < amount) throw new Error("You do not have enough coins.");
      const multiplier = randomItem([0, 0, 0.5, 1.5, 2, 3]);
      const returned = Math.floor(amount * multiplier);
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet - amount + returned });
      await context.reply(`🎰 Multiplier: *${multiplier}×*\nReturn: *${money(returned)}*`);
    },
  },
  {
    name: "blackjack",
    aliases: ["bj"],
    category: "economy",
    description: "Play a quick automated blackjack hand.",
    usage: "blackjack <amount>",
    async execute(context) {
      const amount = amountFrom(context);
      const account = context.store.economy(context.sender);
      if (account.wallet < amount) throw new Error("You do not have enough coins.");
      const player = 15 + Math.floor(Math.random() * 7);
      const dealer = 15 + Math.floor(Math.random() * 8);
      const won = player <= 21 && (dealer > 21 || player > dealer);
      const draw = player === dealer && player <= 21;
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet + (won ? amount : draw ? 0 : -amount) });
      await context.reply(`🃏 You: ${player} • Dealer: ${dealer}\n${draw ? "Push—bet returned." : won ? `You won ${money(amount)}!` : `You lost ${money(amount)}.`}`);
    },
  },
  {
    name: "slots",
    category: "economy",
    description: "Play the slot machine.",
    usage: "slots <amount>",
    async execute(context) {
      const amount = amountFrom(context);
      const account = context.store.economy(context.sender);
      if (account.wallet < amount) throw new Error("You do not have enough coins.");
      const icons = ["🍒", "🍋", "⭐", "💎", "7️⃣"];
      const roll = [randomItem(icons), randomItem(icons), randomItem(icons)];
      const multiplier = new Set(roll).size === 1 ? 5 : new Set(roll).size === 2 ? 1.5 : 0;
      const returned = Math.floor(amount * multiplier);
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet - amount + returned });
      await context.reply(`${roll.join(" │ ")}\n${returned ? `You received ${money(returned)}!` : "No match this time."}`);
    },
  },
  {
    name: "rps",
    category: "economy",
    description: "Play rock-paper-scissors for fun.",
    usage: "rps rock|paper|scissors",
    async execute(context) {
      const user = context.args[0]?.toLowerCase();
      const options = ["rock", "paper", "scissors"];
      if (!options.includes(user)) throw new Error("Choose rock, paper or scissors.");
      const bot = randomItem(options);
      const win = { rock: "scissors", paper: "rock", scissors: "paper" };
      await context.reply(`You: ${user}\nVENOM: ${bot}\n*${user === bot ? "Draw" : win[user] === bot ? "You win" : "VENOM wins"}*`);
    },
  },
  {
    name: "rob",
    category: "economy",
    description: "Attempt to rob another user's wallet.",
    usage: "rob @user",
    async execute(context) {
      const target = targetOrThrow(context);
      const robber = context.store.economy(context.sender);
      const victim = context.store.economy(target);
      const now = Date.now();
      if (now - Number(robber.cooldowns.rob || 0) < 30 * 60_000) throw new Error("Wait 30 minutes between robbery attempts.");
      const protectedUser = victim.inventory.shield > 0;
      const success = Math.random() < (protectedUser ? 0.2 : 0.4) && victim.wallet >= 100;
      const amount = success ? Math.min(victim.wallet, 100 + Math.floor(Math.random() * 800)) : Math.min(robber.wallet, 100 + Math.floor(Math.random() * 300));
      robber.cooldowns.rob = now;
      if (success) {
        robber.wallet += amount;
        victim.wallet -= amount;
      } else robber.wallet -= amount;
      await context.store.updateEconomy(context.sender, robber);
      await context.store.updateEconomy(target, victim);
      await context.reply(success ? `🥷 You stole *${money(amount)}* from @${jidNumber(target)}.` : `🚨 The robbery failed. Fine: *${money(amount)}*.`, { mentions: [target] });
    },
  },
  {
    name: "bankrob",
    aliases: ["heist"],
    category: "economy",
    description: "Attempt a difficult bank heist.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const now = Date.now();
      if (now - Number(account.cooldowns.bankrob || 0) < 6 * 60 * 60_000) throw new Error("Wait six hours between bank heists.");
      const success = Math.random() < 0.18;
      const amount = success ? 5_000 + Math.floor(Math.random() * 15_000) : Math.min(account.wallet, 1_000 + Math.floor(Math.random() * 3_000));
      await context.store.updateEconomy(context.sender, { ...account, wallet: account.wallet + (success ? amount : -amount), cooldowns: { ...account.cooldowns, bankrob: now } });
      await context.reply(success ? `🏦 Heist success! You earned *${money(amount)}*.` : `🚔 Heist failed. You lost *${money(amount)}*.`);
    },
  },
  {
    name: "poor",
    category: "economy",
    description: "Show users with the lowest net worth.",
    async execute(context) {
      const users = context.store.economyLeaders(10_000).slice(-10).reverse();
      await context.reply(`📉 *LOWEST NET WORTH*\n\n${users.map((item, index) => `${index + 1}. @${jidNumber(item.jid)} — ${money(item.total)}`).join("\n") || "No accounts yet."}`, { mentions: users.map((item) => item.jid) });
    },
  },
  {
    name: "shop",
    category: "economy",
    description: "Show items available in the economy shop.",
    async execute(context) {
      await context.reply(`🛒 *VENOM SHOP*\n\n${Object.entries(SHOP).map(([name, item]) => `*${name}* — ${money(item.price)}\n${item.description}`).join("\n\n")}\n\nUse ${context.prefix}buy item`);
    },
  },
  {
    name: "inventory",
    aliases: ["inv"],
    category: "economy",
    description: "Show your owned shop items.",
    async execute(context) {
      const items = Object.entries(context.store.economy(context.sender).inventory).filter(([, count]) => count > 0);
      await context.reply(`🎒 *INVENTORY*\n${items.map(([name, count]) => `• ${name} ×${count}`).join("\n") || "Empty"}`);
    },
  },
  {
    name: "buy",
    category: "economy",
    description: "Buy an item from the economy shop.",
    usage: "buy <item>",
    async execute(context) {
      const name = context.args[0]?.toLowerCase();
      const item = SHOP[name];
      if (!item) throw new Error("That item is not in the shop.");
      const account = context.store.economy(context.sender);
      if (account.wallet < item.price) throw new Error("You do not have enough coins.");
      account.wallet -= item.price;
      account.inventory[name] = (account.inventory[name] || 0) + 1;
      await context.store.updateEconomy(context.sender, account);
      await context.reply(`✅ Bought *${name}* for ${money(item.price)}.`);
    },
  },
  {
    name: "sell",
    category: "economy",
    description: "Sell an owned shop item.",
    usage: "sell <item>",
    async execute(context) {
      const name = context.args[0]?.toLowerCase();
      const item = SHOP[name];
      const account = context.store.economy(context.sender);
      if (!item || !account.inventory[name]) throw new Error("You do not own that shop item.");
      account.inventory[name] -= 1;
      account.wallet += item.sell;
      await context.store.updateEconomy(context.sender, account);
      await context.reply(`✅ Sold *${name}* for ${money(item.sell)}.`);
    },
  },
  {
    name: "use",
    category: "economy",
    description: "Inspect how an owned item is used.",
    usage: "use <item>",
    async execute(context) {
      const name = context.args[0]?.toLowerCase();
      const account = context.store.economy(context.sender);
      if (!SHOP[name] || !account.inventory[name]) throw new Error("You do not own that item.");
      await context.reply(`🎒 *${name}*\n${SHOP[name].description}\nPassive items work automatically.`);
    },
  },
  {
    name: "bankupgrade",
    category: "economy",
    description: "Increase your bank capacity.",
    async execute(context) {
      const account = context.store.economy(context.sender);
      const cost = Math.floor(account.bankLimit * 0.6);
      if (account.wallet < cost) throw new Error(`You need ${money(cost)} for the next upgrade.`);
      account.wallet -= cost;
      account.bankLimit = Math.floor(account.bankLimit * 1.75);
      await context.store.updateEconomy(context.sender, account);
      await context.reply(`🏦 Bank capacity upgraded to *${money(account.bankLimit)}*.`);
    },
  },
  {
    name: "loan",
    category: "economy",
    description: "Take a limited economy loan.",
    usage: "loan <amount>",
    async execute(context) {
      const amount = amountFrom(context);
      const account = context.store.economy(context.sender);
      if (account.debt) throw new Error("Repay your current loan first.");
      if (amount > Math.floor(account.bankLimit / 2)) throw new Error(`Maximum loan: ${money(Math.floor(account.bankLimit / 2))}.`);
      account.wallet += amount;
      account.debt = Math.ceil(amount * 1.1);
      await context.store.updateEconomy(context.sender, account);
      await context.reply(`🏦 Loan received: ${money(amount)}\nAmount due: ${money(account.debt)}`);
    },
  },
  {
    name: "payloan",
    category: "economy",
    description: "Repay your outstanding economy loan.",
    usage: "payloan <amount|all>",
    async execute(context) {
      const account = context.store.economy(context.sender);
      if (!account.debt) throw new Error("You have no outstanding loan.");
      const requested = String(context.args[0]).toLowerCase() === "all" ? account.debt : amountFrom(context);
      const amount = Math.min(requested, account.debt);
      if (account.wallet < amount) throw new Error("Your wallet does not contain that much.");
      account.wallet -= amount;
      account.debt -= amount;
      await context.store.updateEconomy(context.sender, account);
      await context.reply(`✅ Paid ${money(amount)}. Remaining debt: ${money(account.debt)}.`);
    },
  },
  {
    name: "addmoney",
    category: "economy",
    description: "Add economy coins to a user (owner only).",
    usage: "addmoney @user <amount>",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid() || context.sender;
      const amount = amountFrom(context, context.args.length - 1);
      const account = context.store.economy(target);
      await context.store.updateEconomy(target, { ...account, wallet: account.wallet + amount });
      await context.reply(`✅ Added ${money(amount)} to @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "tax",
    category: "economy",
    description: "Deduct economy coins from a user (owner only).",
    usage: "tax @user <amount>",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid();
      if (!target) throw new Error("Mention or quote a user.");
      const amount = amountFrom(context, context.args.length - 1);
      const account = context.store.economy(target);
      const deducted = Math.min(amount, account.wallet);
      await context.store.updateEconomy(target, { ...account, wallet: account.wallet - deducted });
      await context.reply(`✅ Deducted ${money(deducted)} from @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
  {
    name: "resetecon",
    category: "economy",
    description: "Reset a user's economy account (owner only).",
    usage: "resetecon @user",
    ownerOnly: true,
    async execute(context) {
      const target = context.targetJid() || context.sender;
      await context.store.resetEconomy(target);
      await context.reply(`✅ Economy reset for @${jidNumber(target)}.`, { mentions: [target] });
    },
  },
];

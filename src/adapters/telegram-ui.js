/**
 * Telegram-native interface: inline keyboards, paginated category browsing and
 * callback routing.
 *
 * WhatsApp can only answer with text, so `.menu` there is a wall of 633 command
 * names. Telegram has tappable inline keyboards, so the same data is presented
 * as a browsable menu: pick a category, page through it, tap a command to see
 * its help, tap Run to execute it.
 *
 * Callback payloads are capped at 64 bytes by the Bot API, so the scheme is
 * deliberately terse:
 *   m           → menu home
 *   m:c:<cat>:<page>  → category page
 *   m:h:<name>  → help card for one command
 *   m:r:<name>  → run a command that needs no arguments
 *   m:x         → close/dismiss
 */

const CATEGORY_META = {
  ai: ["🧠", "AI"],
  anime: ["🎌", "Anime"],
  autoreply: ["💬", "Autoreply"],
  bot: ["🤖", "Bot"],
  config: ["⚙️", "Config"],
  converter: ["🔄", "Converter"],
  download: ["⬇️", "Downloader"],
  economy: ["💰", "Economy"],
  fun: ["🎉", "Fun"],
  game: ["🎮", "Games"],
  general: ["📖", "General"],
  group: ["👥", "Group"],
  image: ["🖼️", "Image"],
  "image-meme": ["😂", "Memes"],
  media: ["🎬", "Media"],
  misc: ["📦", "Misc"],
  owner: ["👑", "Owner"],
  plugins: ["🧩", "Plugins"],
  privacy: ["🔒", "Privacy"],
  process: ["⚡", "Process"],
  search: ["🔍", "Search"],
  textmaker: ["🎨", "Text Art"],
  tools: ["🛠️", "Tools"],
  user: ["👤", "User"],
  utility: ["🧰", "Utility"],
};

const PAGE_SIZE = 24; // 8 rows of 3 — comfortably inside Telegram's limits.

export function categoryLabel(category) {
  const [emoji, label] = CATEGORY_META[category] || ["•", category];
  return `${emoji} ${label}`;
}

/** Commands that are safe to fire straight from a button (no arguments). */
const RUNNABLE = new Set([
  "ping", "alive", "menu", "help", "repo", "owner", "stats", "runtime", "uptime",
  "fact", "quote", "joke", "coinflip", "roll", "password", "uuid", "time",
  "daily", "balance", "profile", "leaderboard", "advice", "meme",
]);

export function isRunnable(command) {
  return Boolean(
    command &&
      RUNNABLE.has(command.name) &&
      !command.ownerOnly &&
      !command.adminOnly &&
      !command.groupOnly,
  );
}

function chunkRows(buttons, perRow) {
  const rows = [];
  for (let index = 0; index < buttons.length; index += perRow) {
    rows.push(buttons.slice(index, index + perRow));
  }
  return rows;
}

/** Home screen: every category as a button, with live command counts. */
export function homeKeyboard(registry, links = {}) {
  const counts = new Map();
  for (const command of registry.list()) {
    counts.set(command.category, (counts.get(command.category) || 0) + 1);
  }

  const ordered = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const rows = chunkRows(
    ordered.map(([category, count]) => ({
      text: `${categoryLabel(category)} ${count}`,
      callback_data: `m:c:${category}:0`,
    })),
    2,
  );

  const linkRow = [];
  if (links.repo) linkRow.push({ text: "⭐ Star on GitHub", url: links.repo });
  if (links.youtube) linkRow.push({ text: "▶️ YouTube", url: links.youtube });
  if (linkRow.length) rows.push(linkRow);

  return { inline_keyboard: rows };
}

export function homeText(config, registry) {
  return [
    `⚡ <b>${config.botName}</b>`,
    "",
    `<b>${registry.routableCount()}</b> commands across <b>${new Set(registry.list().map((c) => c.category)).size}</b> categories.`,
    "",
    "Tap a category to browse it, or type a command directly.",
    `Example: <code>${"/"}ping</code>`,
  ].join("\n");
}

/** One page of commands inside a category. */
export function categoryKeyboard(registry, category, page) {
  const commands = registry
    .list()
    .filter((command) => command.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));

  const pages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = commands.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const rows = chunkRows(
    slice.map((command) => ({
      text: command.name,
      callback_data: `m:h:${command.name}`.slice(0, 64),
    })),
    3,
  );

  const nav = [];
  if (pages > 1) {
    nav.push({
      text: current > 0 ? "◀️ Prev" : "·",
      callback_data: current > 0 ? `m:c:${category}:${current - 1}` : "m:noop",
    });
    nav.push({ text: `${current + 1}/${pages}`, callback_data: "m:noop" });
    nav.push({
      text: current < pages - 1 ? "Next ▶️" : "·",
      callback_data: current < pages - 1 ? `m:c:${category}:${current + 1}` : "m:noop",
    });
  }
  if (nav.length) rows.push(nav);
  rows.push([
    { text: "🏠 All categories", callback_data: "m" },
    { text: "✖️ Close", callback_data: "m:x" },
  ]);

  return { keyboard: { inline_keyboard: rows }, total: commands.length, page: current, pages };
}

export function categoryText(category, info, prefix) {
  return [
    `${categoryLabel(category)} — <b>${info.total}</b> commands`,
    info.pages > 1 ? `Page ${info.page + 1} of ${info.pages}` : "",
    "",
    "Tap any command for details.",
    `Or type <code>${prefix}command</code> directly.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Detail card for a single command. */
export function helpCard(command, prefix) {
  const lines = [
    `<b>${prefix}${command.name}</b>`,
    "",
    command.description || "No description provided.",
  ];
  if (command.usage) lines.push("", `<b>Usage:</b> <code>${prefix}${command.usage}</code>`);
  if (command.aliases?.length) {
    lines.push(`<b>Aliases:</b> ${command.aliases.map((a) => `<code>${prefix}${a}</code>`).join(", ")}`);
  }

  const flags = [
    command.ownerOnly && "👑 owner only",
    command.adminOnly && "🛡️ admins only",
    command.groupOnly && "👥 groups only",
    command.botAdmin && "⚠️ bot must be admin",
  ].filter(Boolean);
  if (flags.length) lines.push("", flags.join(" · "));

  const rows = [];
  if (isRunnable(command)) {
    rows.push([{ text: `▶️ Run ${prefix}${command.name}`, callback_data: `m:r:${command.name}`.slice(0, 64) }]);
  }
  rows.push([
    { text: "◀️ Back", callback_data: `m:c:${command.category}:0` },
    { text: "🏠 Home", callback_data: "m" },
  ]);

  return { text: lines.join("\n"), keyboard: { inline_keyboard: rows } };
}

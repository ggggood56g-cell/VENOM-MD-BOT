import sharp from "sharp";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result >>> 0);
}

function palette(style) {
  const special = {
    blackpink: ["#ff4fa3", "#111111", "#ffffff"],
    fire: ["#ff2400", "#ffb300", "#fff7cc"],
    galaxy: ["#12002f", "#4c1d95", "#67e8f9"],
    galaxyw: ["#020617", "#312e81", "#ffffff"],
    gaming: ["#111827", "#7c3aed", "#39ff14"],
    gold: ["#2b1700", "#b7791f", "#fff3b0"],
    green: ["#001a0d", "#008f4c", "#39ff14"],
    hacker: ["#000000", "#003b00", "#39ff14"],
    matrix: ["#000000", "#001b00", "#00ff41"],
    metal: ["#111827", "#64748b", "#f8fafc"],
    neon3d: ["#030014", "#5b21b6", "#22d3ee"],
    neonlight: ["#050505", "#111827", "#ff3df2"],
    neontext: ["#020617", "#0f172a", "#39ff14"],
    pubglogo: ["#1c1917", "#92400e", "#fbbf24"],
    pubgtext: ["#0c0a09", "#78350f", "#fde68a"],
    sand: ["#3f2d20", "#c2a878", "#fff7d6"],
    steel: ["#0f172a", "#475569", "#e2e8f0"],
    thunder: ["#11103a", "#302b63", "#fef08a"],
    valorant: ["#111827", "#991b1b", "#ff4655"],
    water: ["#082f49", "#0369a1", "#bae6fd"],
    wood: ["#2d1606", "#7c3f14", "#f3d2a2"],
  };
  if (special[style]) return special[style];
  const hue = hash(style) % 360;
  return [`hsl(${hue} 70% 10%)`, `hsl(${(hue + 55) % 360} 70% 36%)`, "#ffffff"];
}

function linesFor(text, maximum = 18) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maximum && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export async function renderTextStyle(text, style, { square = false } = {}) {
  const value = String(text || "").trim().slice(0, 80);
  if (!value) throw new Error("Enter text to render.");
  const width = square ? 768 : 1200;
  const height = square ? 768 : 675;
  const [start, end, accent] = palette(style);
  const lines = linesFor(value, square ? 13 : 20);
  const fontSize = Math.max(54, Math.min(square ? 112 : 104, 310 / Math.max(1, lines.length)));
  const lineHeight = fontSize * 1.12;
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const textNodes = lines
    .map(
      (line, index) =>
        `<text x="50%" y="${startY + index * lineHeight}" text-anchor="middle" dominant-baseline="middle">${escapeXml(line)}</text>`,
    )
    .join("");
  const label = escapeXml(style.toUpperCase().replaceAll("-", " "));
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${start}"/>
          <stop offset="1" stop-color="${end}"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="${accent}" stroke-opacity="0.09"/></pattern>
      </defs>
      <rect width="100%" height="100%" rx="42" fill="url(#background)"/>
      <rect width="100%" height="100%" rx="42" fill="url(#grid)"/>
      <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="30" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="3"/>
      <g fill="${accent}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="2" filter="url(#glow)" stroke="#000000" stroke-opacity="0.4" stroke-width="3" paint-order="stroke">${textNodes}</g>
      <text x="50%" y="${height - 58}" text-anchor="middle" fill="${accent}" fill-opacity="0.8" font-family="DejaVu Sans, sans-serif" font-size="24" letter-spacing="7">${label} • VENOM MD</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
}

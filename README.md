<div align="center">

# ⚡ VENOM MD BOT

### Fast. Secure. Powerful. Completely yours.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-22c55e?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-MIT-8b5cf6?style=for-the-badge)](LICENSE)
[![Commands](https://img.shields.io/badge/Commands-539-ef4444?style=for-the-badge)](#-command-centre)

**Created and maintained by TAPRUSH EMP (Micheal)**

[Get Session ID](https://session-site-2odn.onrender.com) · [Deploy](#-deploy-anywhere) · [Commands](#-command-centre) · [Configuration](#%EF%B8%8F-configuration)

</div>

---

## ✨ A clean new beginning

VENOM MD BOT is an original WhatsApp multi-device bot foundation built for dependable daily use. It connects with the existing VENOM session website, keeps private credentials out of logs, recovers from temporary disconnects, and provides a clean command system that is easy to expand.

| ⚡ Performance | 🛡️ Safety | 🧩 Extensible | 🌍 Deployable |
|---|---|---|---|
| Lean event routing and bounded media | Owner/admin permissions and secret redaction | Secure recursive plugin auto-discovery | Docker, Render, Railway, Koyeb, Heroku, Fly.io and VPS |
| Controlled reconnect backoff | Anti-link modes and media limits | Persistent group configuration | Health and status endpoints |
| Local-first startup | No pairing endpoint inside the bot | Eight optional AI providers | Optional MongoDB backup |

## 🚀 Highlights

- **469 implemented plugin objects with exactly 539 routable command names** and a polished dynamic menu
- **External session compatibility** with the completed VENOM pairing website
- **Persistent authentication** using protected local files and optional MongoDB backup
- **Group management** including promote, demote, kick, add, open/close, link controls and tagging
- **Moderation** with anti-link delete/warn/kick modes and three-strike warnings
- **Custom welcome/goodbye messages** with group and user placeholders
- **Media and converter tools** with 31 FFmpeg effects, image filters, stickers and branded EXIF
- **YouTube search, audio and video** with bounded downloads
- **51 local textmaker styles** that do not depend on fragile third-party logo APIs
- **Persistent economy system** with earning, banking, games, shop, inventory, loans and leaderboards
- **Anime, reactions, search, translation and text-to-speech** utilities
- **Eight optional AI providers**: Gemini, OpenAI, DeepSeek, Groq, Mistral, OpenRouter, Cerebras and Cohere
- **Graceful shutdown, reconnect backoff and safe health reporting**

## 🔑 Connect your WhatsApp account

Pairing is already handled by the separate live VENOM session website:

<div align="center">

### [OPEN THE VENOM SESSION WEBSITE](https://session-site-2odn.onrender.com)

</div>

1. Open the session website.
2. Choose QR or phone-number pairing.
3. Complete linking inside WhatsApp → **Linked devices**.
4. Copy the generated long session ID.
5. Add it to your deployment as the private `SESSION_ID` environment variable.
6. Start or redeploy the bot.

> **Never post a session ID in chat, GitHub, screenshots or logs.** It provides access to the linked WhatsApp account. If it leaks, remove that linked device in WhatsApp and generate a fresh ID.

The bot intentionally contains **no built-in QR or phone pairing service**. If credentials are missing, it remains healthy with the clear status `awaiting-session` instead of entering a reconnect loop.

## ⚙️ Configuration

Copy [`.env.example`](.env.example) to `.env` for local use:

```bash
cp .env.example .env
```

Minimum configuration:

```env
SESSION_ID=your_private_value_from_the_session_website
OWNER_NUMBER=2348021016309
BOT_NAME=VENOM MD BOT
PREFIX=.
COMMAND_MODE=public
```

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `SESSION_ID` | First link | blank | Private base64 credential from the session website |
| `SESSION_NAMESPACE` | No | `venom` | Safe local/database namespace |
| `OWNER_NUMBER` | Yes | `2348021016309` | Owner numbers, digits only; commas separate multiple owners |
| `OWNER_NAME` | No | `TAPRUSH EMP (Micheal)` | Public owner display name |
| `BOT_NAME` | No | `VENOM MD BOT` | Bot display name |
| `PREFIX` / `PREFIXES` | No | `.` | Command trigger; initial multiple prefixes may be comma-separated |
| `COMMAND_MODE` | No | `public` | `public` for everyone or `private` for owners |
| `DATABASE_URL` | No | local files | MongoDB URL for remote settings and session backup |
| `GEMINI_API_KEY` | No | blank | Enables Gemini and automatic `.ai` fallback |
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY` | No | blank | Enable their matching AI commands |
| `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | No | blank | Enable their matching AI commands |
| `CEREBRAS_API_KEY`, `COHERE_API_KEY` | No | blank | Enable their matching AI commands |
| `TIMEZONE` | No | `Africa/Lagos` | Time/date command timezone |
| `AUTO_READ` | No | `false` | Mark incoming chats as read |
| `AUTO_READ_STATUS` | No | `false` | Mark WhatsApp statuses as read |
| `ALWAYS_ONLINE` | No | `false` | Advertise online presence |
| `REJECT_CALL` | No | `true` | Reject calls and ask users to send a message |
| `MEDIA_MAX_MB` | No | `32` | Download/conversion safety limit, 5–64 MB |
| `PORT` | No | `10000` | Health server port |

`MONGODB` and `MONGO_URI` are accepted aliases for `DATABASE_URL`.

## 🧭 Command centre

Open the live menu with `.menu`. Use `.help command` for command-specific instructions.

| Category | Routable names | Examples |
|---|---:|---|
| **Help/general** | 16 | `menu`, `help`, `ping`, `alive`, `runtime` |
| **AI** | 19 | `ai`, `gemini`, `gpt`, `deepseek`, `groq`, `imagine` |
| **Anime** | 10 | `anime`, `manga`, `character`, `airing`, `waifu` |
| **Fun/reactions** | 62 | `hug`, `kiss`, `slap`, `truth`, `pokemon`, `wyr` |
| **Downloader** | 19 | `ytsearch`, `song`, `autodl`, `gitclone`, `gdrive`, `ytinfo` |
| **Converter** | 36 | `tomp3`, `bass`, `nightcore`, `smooth`, `ptv`, `take` |
| **Search** | 15 | `country`, `github`, `news`, `lyrics`, `wiki`, `websearch` |
| **Economy** | 44 | `balance`, `daily`, `bankrob`, `shop`, `loan`, `leaderboard` |
| **Textmaker** | 51 | `fire`, `blackpink`, `matrix`, `neontext`, `ttp`, `zodiac` |
| **Games** | 8 | `hangman`, `ttt`, `wcg`, `guess`, `trivia` |
| **Group admin** | 58 | `tagall`, `antispam`, `antiword`, `poll`, `welcome`, `kickall` |
| **Tools** | 21 | `afk`, `remind`, `setcmd`, `quotedinfo`, `ison`, `permit` |
| **Image** | 12 | `blur2`, `enhance`, `pixelate`, `couple`, `rotate` |
| **Image memes** | 29 | `wanted`, `wasted`, `jail`, `drake`, `trigger-meme` |
| **Media** | 7 | `sticker`, `toimg`, `mediainfo` |
| **Bot/process** | 18 | `stats`, `backup`, `ban`, `broadcast`, `restart`, `shutdown` |
| **Misc** | 8 | `advice`, `quote`, `ebinary`, `flipcoin`, `rolldice` |
| **Utilities** | 42 | `calc`, `qrcode`, `pdf`, `weather`, `currency`, `readqr` |
| **Plugin control** | 4 | `plugins`, `plugin`, `delplugin`, `reload` |
| **Config** | 23 | `alwaysonline`, `cmdreact`, `readstatus`, `setvar`, `roles` |
| **User** | 16 | `bio`, `forward`, `pinchat`, `setpp`, `archive` |
| **Privacy** | 7 | `privacy`, `lastseen`, `presence`, `mypp`, `read` |
| **Auto reply** | 5 | `pfilter`, `gfilter`, `listfilters`, `pstop`, `gstop` |
| **Owner control** | 9 | `mode`, `prefix`, `setname`, `setbio`, `block` |

The menu count is generated from the real registry; it is never hard-coded. Run `.menu <category>` for one section or `.menu <command>` for details.

### Group automation examples

```text
.antilink warn
.welcome on
.setwelcome Welcome @user to *{group}*!
.goodbye on
.group close
```

Anti-link actions:

- `off` — no link moderation
- `delete` — remove the link message
- `warn` — remove it and issue a warning; warning three removes the sender
- `kick` — remove the link message and sender immediately

## 💻 Local installation

Requirements: **Node.js 20.18+** and **FFmpeg** for video stickers.

```bash
git clone https://github.com/MykelGoal/VENOM-MD-BOT.git
cd VENOM-MD-BOT
npm ci
cp .env.example .env
# Add SESSION_ID privately to .env
npm start
```

Validate the complete project:

```bash
npm test
```

Health endpoints:

- `GET /` — simple process response
- `GET /health` — deployment health and safe bot status
- `GET /api/status` — safe connection details; never returns credentials

## ☁️ Deploy anywhere

<div align="center">

[![Deploy on Render](https://img.shields.io/badge/Render-Deploy-00c7b7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMykelGoal%2FVENOM-MD-BOT)
[![Deploy on Railway](https://img.shields.io/badge/Railway-Deploy-7c3aed?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app/new/template?template=https://github.com/MykelGoal/VENOM-MD-BOT)
[![Deploy on Heroku](https://img.shields.io/badge/Heroku-Deploy-430098?style=for-the-badge&logo=heroku&logoColor=white)](https://heroku.com/deploy?template=https://github.com/MykelGoal/VENOM-MD-BOT)
[![Deploy on Koyeb](https://img.shields.io/badge/Koyeb-Deploy-121212?style=for-the-badge&logo=koyeb&logoColor=white)](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com/MykelGoal/VENOM-MD-BOT&branch=main&name=venom-md-bot&ports=10000%3Bhttp%3B%2F)

</div>

Deployment files included:

- `Dockerfile` — production Node 22 image with FFmpeg
- `render.yaml` — Render Blueprint
- `railway.json` and `nixpacks.toml` — Railway
- `koyeb.json` — Koyeb
- `app.json`, `heroku.yml`, `Procfile` — Heroku-compatible hosts
- `fly.toml` — Fly.io

For hosts with temporary filesystems, configure `DATABASE_URL` so current session files and group settings survive redeployments. The original `SESSION_ID` remains a first-link fallback.

## 🧩 Professional plugin auto-registry

There is no central list of plugin imports to maintain. At startup, `plugin-loader.js` recursively discovers every local `.js`/`.mjs` module under `src/plugins/`, validates its manifest, rejects symlinks and duplicate names, and loads files in deterministic order.

Adding a command only requires a new local file:

```js
// src/plugins/example.js
export default {
  name: "example",
  aliases: ["demo"],
  category: "utility",
  description: "Example auto-discovered command.",
  async execute(context) {
    await context.reply("Automatically registered.");
  },
};
```

No edit to `src/plugins/index.js`, `bot.js`, or a command registry is needed. Invalid plugins fail startup with the exact source filename instead of silently breaking commands.

## 🧱 Clean architecture

```text
├── index.js                 # lifecycle and graceful shutdown
├── src/
│   ├── auth-store.js        # session import, local auth and MongoDB backup
│   ├── bot.js               # Baileys connection and event lifecycle
│   ├── config.js            # validated environment configuration
│   ├── plugin-loader.js     # recursive local discovery and manifest validation
│   ├── router.js            # permissions, command routing and moderation
│   ├── state-store.js       # persistent settings, filters, economy and reminders
│   ├── plugins/             # automatically discovered command modules
│   └── services/            # AI, media, HTTP, text and YouTube helpers
├── test/                    # validation and regression tests
└── Dockerfile               # reproducible deployment
```

No remote code loader is used. Discovery is restricted to visible local source files inside `src/plugins/`.

## 🛡️ Responsible use

- Use the bot only with accounts and groups you are authorized to manage.
- Keep owner, group-admin and moderation actions under human control.
- Do not use broadcast, scraping or download features to violate platform rules or rights.
- Review WhatsApp's terms and your hosting provider's policies.
- Keep dependencies updated and run `npm test` before deployment.

## 📄 License

Released under the [MIT License](LICENSE).

<div align="center">

**VENOM MD BOT** · Built with purpose by **TAPRUSH EMP (Micheal)**

</div>

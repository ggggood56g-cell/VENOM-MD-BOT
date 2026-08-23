<div align="center">

<img src="assets/venom-md-banner.jpg" alt="VENOM MD BOT" width="860"/>

# ⚡ VENOM MD BOT

**A fast, powerful WhatsApp multi-device bot — up and running in about 10 minutes.**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-22c55e?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-MIT-8b5cf6?style=for-the-badge)](LICENSE)

<!-- ===== LIVE STATS ===== -->
<a href="https://www.youtube.com/@venommdbot?sub_confirmation=1" target="_blank">
  <img src="https://img.shields.io/badge/dynamic/json?url=https://api.socialcounts.org/youtube-live-subscriber-count/UC9vkZyWIRN2iX66uupikjfw&query=counters.estimation.subscriberCount&style=for-the-badge&label=YouTube%20Subscribers&labelColor=ff0000&color=ff0000&logo=youtube&logoColor=white" alt="YouTube subscribers"/>
</a>
<a href="https://github.com/MykelGoal/VENOM-MD-BOT/stargazers">
  <img src="https://img.shields.io/github/stars/MykelGoal/VENOM-MD-BOT?style=for-the-badge&label=Stars&labelColor=1f2937&color=facc15&logo=github&logoColor=white" alt="GitHub stars"/>
</a>
<a href="https://github.com/MykelGoal/VENOM-MD-BOT/network/members">
  <img src="https://img.shields.io/github/forks/MykelGoal/VENOM-MD-BOT?style=for-the-badge&label=Forks&labelColor=1f2937&color=60a5fa&logo=github&logoColor=white" alt="GitHub forks"/>
</a>

<!-- ===== CALL TO ACTION ===== -->
<table>
<tr>
<td align="center" width="280">

**📺 Love the tutorials?**

<a href="https://www.youtube.com/@venommdbot?sub_confirmation=1" target="_blank">
  <img src="https://custom-icon-badges.demolab.com/badge/-SUBSCRIBE-ff0000?style=for-the-badge&logo=video&logoColor=white&labelColor=cc0000" alt="Subscribe on YouTube" height="38"/>
</a>

<sub>Watch on <b>VENOM MD Tech</b></sub>

</td>
<td align="center" width="280">

**⭐ Enjoy the bot?**

<a href="https://github.com/MykelGoal/VENOM-MD-BOT">
  <img src="https://custom-icon-badges.demolab.com/badge/-STAR%20THE%20REPO-facc15?style=for-the-badge&logo=star&logoColor=1f2937&labelColor=eab308" alt="Star the repo" height="38"/>
</a>

<sub>Starring helps others find VENOM MD</sub>

</td>
</tr>
</table>

[![Join Telegram](https://img.shields.io/badge/Join%20Us-Telegram-229ED9?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/+PYae7FAKkbEwM2E0)
[![Join WhatsApp](https://img.shields.io/badge/Join%20Us-WhatsApp%20Group-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://chat.whatsapp.com/CWpMOawc88e9DWGwfjW5Ia)

[**GET SESSION ID**](https://session-site-2odn.onrender.com) · [**GET BOT TOKEN**](https://t.me/BotFather) · [**FORK REPOSITORY**](https://github.com/MykelGoal/VENOM-MD-BOT/fork)

</div>

---

## 🐍 About

VENOM MD BOT runs on **WhatsApp and Telegram from one deploy**. It works out of the box with **no API keys**, and includes **633 commands** for group management, media, AI, games, downloads and useful everyday tools — the same commands on both platforms.

### Main features

- **AI commands with 8 optional providers** (Gemini, OpenAI, Groq, DeepSeek, Mistral, OpenRouter, Cerebras, Cohere)
- Group administration, welcome messages and anti-link protection
- Stickers, media conversion and download tools
- Games, economy, search and utility commands
- Local storage with optional MongoDB backup
- **Telegram support with a tappable button menu** — one `PLATFORM` variable switches it on
- Support for Render, Railway, Koyeb, Heroku, Docker and VPS

---

## 🔑 Get a Session ID (WhatsApp)

<div align="center">

[![Get Session ID](https://img.shields.io/badge/GET%20SESSION%20ID-OPEN%20SITE-ef4444?style=for-the-badge&logo=whatsapp&logoColor=white)](https://session-site-2odn.onrender.com)

</div>

1. Open the session website.
2. Link your WhatsApp account using QR or phone-number pairing.
3. Copy the generated session ID.
4. Add it to your deployment as `SESSION_ID`.

> **Keep your session ID private.** Anyone with it may be able to access your WhatsApp account.

---

## 🤖 Get a Bot Token (Telegram)

<div align="center">

[![Open BotFather](https://img.shields.io/badge/OPEN-@BotFather-229ED9?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/BotFather)
[![Get your ID](https://img.shields.io/badge/GET%20YOUR%20ID-@userinfobot-0088cc?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/userinfobot)

<sub>No session website · No QR code · <b>No ban risk</b></sub>

</div>

Two taps and you have everything Telegram needs — it takes about 40 seconds.

| ① Create the bot | ② Find your user ID |
|---|---|
| Open **[@BotFather](https://t.me/BotFather)** and send `/newbot` | Open **[@userinfobot](https://t.me/userinfobot)** and send `/start` |
| Choose a display name, then a username ending in `bot` — for example `VenomMdBot` | It instantly replies with `Id: 123456789` |
| BotFather replies with a token like `8123456789:AAF-abc123def456` | Copy the number |
| Save it as **`TELEGRAM_BOT_TOKEN`** | Save it as **`TELEGRAM_OWNER_ID`** |
| 🔒 Treat it like a password | 👑 This makes you the owner, exactly like `OWNER_NUMBER` on WhatsApp |

> **Important:** while you are still in [@BotFather](https://t.me/BotFather), send `/setprivacy`, pick your bot and choose **Disable**. Without this your bot cannot read group messages, so anti-link and anti-spam will not work.

<details>
<summary><b>Optional — polish your bot in BotFather</b></summary>

<br/>

| Command | What it does |
|---|---|
| `/setdescription` | Text shown before a user presses Start |
| `/setabouttext` | Short bio on the bot's profile |
| `/setuserpic` | Profile picture — use `assets/venom-md-banner-v2.jpg` |
| `/setjoingroups` | **Enable** so the bot can be added to groups |
| `/setprivacy` | **Disable** so it can read group messages |
| `/revoke` | Generate a fresh token if yours ever leaks |

</details>

> **Keep your bot token private**, exactly like a session ID. If it leaks, run `/revoke` in BotFather and paste the new token into your host.

📖 Full walkthrough: **[docs/TELEGRAM.md](docs/TELEGRAM.md)**

---

## 🚀 Quick Deploy

**Three steps, about ten minutes:** ① [Fork the repo](https://github.com/MykelGoal/VENOM-MD-BOT/fork) → ② get your credential — [Session ID](https://session-site-2odn.onrender.com) for WhatsApp or a [BotFather token](https://t.me/BotFather) for Telegram → ③ deploy with one click below.

| Platform | Deploy |
|---|---|
| **Render** | [![Render](https://img.shields.io/badge/Deploy-Render-00c7b7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMykelGoal%2FVENOM-MD-BOT) |
| **Railway** | [![Railway](https://img.shields.io/badge/Deploy-Railway-7c3aed?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app/new/template?template=https://github.com/MykelGoal/VENOM-MD-BOT) |
| **Koyeb** | [![Koyeb](https://img.shields.io/badge/Deploy-Koyeb-121212?style=for-the-badge&logo=koyeb&logoColor=white)](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com/MykelGoal/VENOM-MD-BOT&branch=main&name=venom-md-bot&ports=10000%3Bhttp%3B%2F) |
| **Heroku** | [![Heroku](https://img.shields.io/badge/Deploy-Heroku-430098?style=for-the-badge&logo=heroku&logoColor=white)](https://heroku.com/deploy?template=https://github.com/MykelGoal/VENOM-MD-BOT) |

For **Render Quick Deploy**, enter both values when Render asks for environment variables:

- `SESSION_ID`: the private session ID generated by the session website.
- `OWNER_NUMBER`: your WhatsApp number with country code, digits only (for example, `234XXXXXXXXXX` — do not include `+`).

The Render blueprint deliberately marks `OWNER_NUMBER` as a deploy-time secret, so each person who forks the repository can provide their own number instead of using the repository owner's number. If Render does not show the field, add `OWNER_NUMBER` manually under **Environment Variables** before deploying.

> **Every platform:** always set `OWNER_NUMBER` to your own WhatsApp number. Some deploy templates pre-fill it with the repository owner's number by default.

### Choosing WhatsApp, Telegram, or both

One deploy serves either platform. A single variable, **`PLATFORM`**, decides
which one starts — you do not need a second service, a second repo or a second
bill.

| `PLATFORM` | What runs | Variables you must set |
|---|---|---|
| *(not set)* | WhatsApp only | `SESSION_ID`, `OWNER_NUMBER` |
| `whatsapp` | WhatsApp only | `SESSION_ID`, `OWNER_NUMBER` |
| `telegram` | Telegram only | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID` |
| `both` | Both at once, one process | all four |

For a **Telegram deploy**, set `PLATFORM=telegram` plus your BotFather token,
and leave `SESSION_ID` and `OWNER_NUMBER` blank — no session website, no ban
risk.

<div align="center">

[![Open BotFather](https://img.shields.io/badge/TOKEN-@BotFather-229ED9?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/BotFather)
[![Get your ID](https://img.shields.io/badge/YOUR%20ID-@userinfobot-0088cc?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/userinfobot)

</div>

The startup log always states which mode it picked and what is missing:

```
Running in telegram mode   { whatsapp: "off", telegram: "ready" }
```

Full walkthrough: **[docs/TELEGRAM.md](docs/TELEGRAM.md)**.

---

## ⏰ Run 24/7 with UptimeRobot (free)

Free hosting platforms sleep idle apps. VENOM MD keeps itself awake by pinging its own `/health` endpoint every 4 minutes, and you can add extra protection with a free [UptimeRobot](https://uptimerobot.com) monitor:

1. Deploy the bot and copy your public URL (for example `https://your-app.onrender.com`).
2. Create a free UptimeRobot account → **Add New Monitor**.
3. Type: **HTTP(s)** — URL: `https://your-app.onrender.com/health` — interval: **5 minutes**.
4. Save. UptimeRobot now pings the bot forever, so it never sleeps.

Optionally set a `PING_URL` environment variable to any URL the bot should ping itself (an UptimeRobot monitor or your app URL) for double cover.

---

## 🛠️ Manual Installation

Requires **Node.js 20.18+**. FFmpeg is recommended for media commands.

**VPS (Ubuntu/Debian) one-liner** — installs Node.js and FFmpeg if missing, clones the repo and prepares `.env`:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/MykelGoal/VENOM-MD-BOT/main/scripts/install.sh)
```

Or step by step:

```bash
git clone https://github.com/MykelGoal/VENOM-MD-BOT.git
cd VENOM-MD-BOT
npm ci
cp .env.example .env
npm start
```

Add at least these values to `.env`:

```env
SESSION_ID=your_private_session_id
OWNER_NUMBER=234XXXXXXXXXX
PREFIX=.
COMMAND_MODE=public
```

See [`.env.example`](.env.example) for optional settings and AI keys. After startup, send `.menu` in WhatsApp to view all commands.

---

## ⚠️ Notice

Use this bot only with accounts and groups you are authorized to manage. Do not use it to spam, abuse services or violate WhatsApp's terms.

## 📜 Credits

- **Developer:** [TAPRUSH EMP (Micheal)](https://github.com/MykelGoal)
- **Core library:** [Baileys](https://github.com/WhiskeySockets/Baileys)
- **YouTube:** [VENOM MD Tech](https://www.youtube.com/@venommdbot?sub_confirmation=1)
- **Community:** [Telegram](https://t.me/+PYae7FAKkbEwM2E0) · [WhatsApp Group](https://chat.whatsapp.com/CWpMOawc88e9DWGwfjW5Ia)
- **License:** [MIT](LICENSE)

<div align="center">

**VENOM MD BOT** — Built by [TAPRUSH EMP](https://github.com/MykelGoal) · 📺 [VENOM MD Tech](https://www.youtube.com/@venommdbot?sub_confirmation=1) · ⭐ [Support the repo](https://github.com/MykelGoal/VENOM-MD-BOT)

</div>

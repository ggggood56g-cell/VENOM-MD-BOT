<div align="center">
  <img src="Assets/Venom.jpg" alt="VENOM MD BOT logo" width="320">

# VENOM MD BOT

**A Baileys v7 WhatsApp multi-device bot by TAPRUSH EMP (Micheal)**

[![GitHub](https://img.shields.io/badge/GitHub-MykelGoal-181717?style=for-the-badge&logo=github)](https://github.com/MykelGoal)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Contact-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://wa.me/2348021016309)
[![Tutorial](https://img.shields.io/badge/YouTube-Tutorial-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/ct4k9tfL1Fg)

</div>

> [!IMPORTANT]
> This project is not affiliated with WhatsApp or Meta. Automated accounts can
> be restricted or banned. Use a secondary number, obey WhatsApp's terms, and
> never share your session files, generated session credential, MongoDB URL, or API keys.

## What this version includes

VENOM MD BOT now uses the actively maintained Atlas-MD plugin architecture as
its working base, rebranded and hardened for VENOM. It includes:

- Baileys v7 multi-device connection
- integration with VENOM's existing external session site
- local WhatsApp auth files with MongoDB session backup
- commands for groups, moderation, downloads, search, stickers, media,
  conversion, AI, reactions, and utilities
- reconnect watchdog, anti-delete cache, status page, and deployment files
- a simple `Plugins/` architecture for adding VENOM commands

Remote chat-installed JavaScript plugins and the upstream real-time `eval`
command are intentionally disabled. Add reviewed command files directly to the
repository instead.

## Requirements

- Node.js **22 or newer**
- npm
- a private MongoDB database (local MongoDB is suitable for development)
- a WhatsApp number, preferably a secondary account

FFmpeg is supplied by `ffmpeg-static`; some image commands also benefit from a
system ImageMagick installation.

## Install locally

```bash
git clone https://github.com/MykelGoal/VENOM-MD-BOT.git
cd VENOM-MD-BOT
cp .env.example .env
npm ci
npm test
npm start
```

Edit `.env` before starting:

```dotenv
PREFIX=.
MODS=2348021016309
MONGODB=mongodb://127.0.0.1:27017/venom
SESSION_NAMESPACE=venom
SESSION_ID=paste-private-value-from-the-existing-session-site
PACKNAME=VENOM MD BOT
AUTHOR=by: TAPRUSH EMP (Micheal)
PORT=10000
```

`MODS` controls administrative access for a deployment. It does not replace
the permanent public creator credit.

## Link WhatsApp

VENOM does **not** include a second QR or pairing website. Use the existing
VENOM session service created for this project:

**https://session-site-2odn.onrender.com**

1. Open that service and link the WhatsApp account there.
2. Copy the private session value it sends you into the deployment's
   `SESSION_ID` environment variable.
3. Set `SESSION_NAMESPACE` to a short storage name such as `venom`.
4. Start VENOM. The credential is strictly validated, imported once, removed
   from the process environment, and then persisted through MongoAuth.

The generated value controls the linked WhatsApp account. Never paste it in a
chat, commit it, include it in logs, or share it. A future update will upgrade
this **same external site** to issue short, one-time tokens; no replacement
pairing page will be added to this repository.

Auth files are stored under `System/session/<SESSION_NAMESPACE>/` and ignored
by Git. Never publish that directory.

## Configuration

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `MONGODB` | Production | local VENOM URL | Settings, moderation data, and session backup |
| `SESSION_NAMESPACE` | No | `venom` | Safe local/MongoAuth storage name |
| `SESSION_ID` | First link | blank | Private credential from VENOM's existing external session site |
| `MODS` | No | creator number | Comma-separated deployment owners |
| `PREFIX` | No | `.` | Command prefix |
| `PACKNAME` | No | `VENOM MD BOT` | Sticker pack name |
| `AUTHOR` | No | creator credit | Sticker author |
| `GEMINI_API` | No | blank | Gemini keys, comma-separated |
| `OPENAI_API` | No | blank | OpenAI keys, comma-separated |
| `CLAUDE_API` | No | blank | Anthropic keys, comma-separated |
| `TENOR_API_KEY` | No | blank | Tenor keys, comma-separated |
| `OPENWEATHER_API_KEY` | No | blank | OpenWeather key for weather search |
| `PIXABAY_API_KEY` | No | blank | Pixabay key for logo backgrounds |
| `TIKTOK_API_KEY` | No | blank | TikTok provider keys, comma-separated |
| `TIKTOK_API_BASE_URL` | No | bundled provider URL | Compatible trusted TikTok API endpoint |
| `MEDIA_MAX_MB` | No | `64` | Maximum inbound/downloaded media size |
| `FFMPEG_PATH` | No | auto-detected | Optional FFmpeg executable path |
| `PORT` | No | `10000` | Web server port |
| `TRUST_PROXY` | No | `false` | Set `true` only behind one trusted reverse proxy |

See [`.env.example`](.env.example) for maintenance settings.

## Deploy

### Docker

```bash
docker build -t venom-md-bot .
docker run --rm -p 10000:10000 --env-file .env \
  -v venom-session:/app/System/session venom-md-bot
```

### Render, Railway, Koyeb, or another Node host

1. Fork this repository.
2. Create a web service from your fork.
3. Use `npm ci` as the build command and `npm start` as the start command.
4. Add the variables from `.env.example`, especially `MONGODB`,
   `SESSION_NAMESPACE`, the private `SESSION_ID` from the existing VENOM
   session site, and `MODS`.
5. Expose port `10000` or let the host provide `PORT`.
6. Use persistent storage for `System/session` where available; otherwise the
   MongoDB backup restores the session after restarts.

[Deploy to Heroku](https://heroku.com/deploy?template=https://github.com/MykelGoal/VENOM-MD-BOT)

## Add a command

Create a reviewed JavaScript file in `Plugins/`. A minimal command looks like:

```js
export default {
  name: "hello",
  alias: ["hello", "hi"],
  uniquecommands: ["hello"],
  description: "Send a greeting",
  start: async (Venom, message, { inputCMD }) => {
    if (inputCMD === "hello" || inputCMD === "hi") {
      await message.reply("Hello from VENOM MD BOT!");
    }
  },
};
```

Run `npm test` before deploying. Restart the bot after adding or changing a
plugin.

## Public project information

- **Bot:** VENOM MD BOT
- **Creator:** TAPRUSH EMP (Micheal)
- **GitHub:** [MykelGoal](https://github.com/MykelGoal)
- **WhatsApp:** [2348021016309](https://wa.me/2348021016309)
- **YouTube tutorial:** [Watch here](https://youtu.be/ct4k9tfL1Fg)

## License and upstream credit

This repository is MIT licensed. VENOM MD BOT is based on
[FantoX/Atlas-MD](https://github.com/FantoX/Atlas-MD) at commit
`3b87370dc6fd14bb953524bb9e47880cf235e4c0`. The original FantoX copyright and
MIT notice are retained in [`LICENSE`](LICENSE); details are in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

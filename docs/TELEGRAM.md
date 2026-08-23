# VENOM MD BOT on Telegram

One bot, both platforms. The same **633 commands** that run on WhatsApp run on
Telegram — same code, same database, one deploy.

There is no session site, no QR code, no scanning, and **no ban risk**: Telegram
has an official Bot API, so this is a supported use, not a workaround.

---

## 1. Create your bot (40 seconds)

1. Open Telegram and message **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`.
3. Choose a display name: `VENOM MD BOT`
4. Choose a username ending in `bot`: `VenomMdBot` (try `VenomMD_Bot` if taken).
5. BotFather replies with a token that looks like:

   ```
   8123456789:AAF-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

Copy it. **That token is a password** — never paste it in a chat, a video, or a
commit. If it leaks, send `/revoke` to BotFather.

### Polish the profile (optional, 1 minute)

```
/setdescription
⚡ 633 commands. AI, downloaders, stickers, text art, memes, games and group
tools. No API keys needed. Free and open source.

/setabouttext
⚡ 633 commands, zero API keys. github.com/MykelGoal/VENOM-MD-BOT

/setuserpic     → upload assets/venom-md-banner-v2.jpg
/setjoingroups  → Enable   (lets people add the bot to groups)
/setprivacy     → Disable  (REQUIRED for group commands — see below)
```

> **`/setprivacy` → Disable is important.** By default Telegram only shows a bot
> messages that start with `/`. Disabling privacy mode lets VENOM see normal
> messages, which is what antilink, antispam and the chat filters need.

---

## 2. Run it

### Locally

```bash
git clone https://github.com/MykelGoal/VENOM-MD-BOT.git
cd VENOM-MD-BOT
npm ci
cp .env.example .env
```

Edit `.env`:

```env
PLATFORM=telegram
TELEGRAM_BOT_TOKEN=8123456789:AAF-your-token-here
TELEGRAM_OWNER_ID=123456789
```

Get your numeric id from [@userinfobot](https://t.me/userinfobot).

```bash
npm start
```

Message your bot `/menu`. That's it.

### On Render / Railway / Koyeb / Heroku

Deploy exactly as documented in the main README, then set these environment
variables instead of `SESSION_ID`:

| Variable | Value |
|---|---|
| `PLATFORM` | `telegram` |
| `TELEGRAM_BOT_TOKEN` | your BotFather token |
| `TELEGRAM_OWNER_ID` | your numeric Telegram id |

Keep the UptimeRobot monitor on `/health` so free tiers stay awake.

---

## 3. Run both platforms at once

```env
PLATFORM=both
SESSION_ID=your-whatsapp-session
OWNER_NUMBER=2348012345678
TELEGRAM_BOT_TOKEN=8123456789:AAF-...
TELEGRAM_OWNER_ID=123456789
```

One process, one database, one bill. `/api/status` reports each adapter
separately:

```json
{
  "platform": "both",
  "connected": true,
  "adapters": {
    "whatsapp": { "status": "open", "connected": true },
    "telegram": { "status": "open", "connected": true, "username": "@VenomMdBot" }
  }
}
```

If WhatsApp gets banned, the Telegram side keeps running untouched.

---

## 4. Using the commands

Both prefixes work. `/ping` and `.ping` are the same command — Telegram's
native `/` is rewritten to your configured `PREFIX` automatically, and
`/ping@YourBot` (what Telegram sends in groups) is handled too.

The 44 most useful commands appear in Telegram's `/` autocomplete menu. All
633 remain available by typing them.

```
/menu          all commands, grouped by category
/menu ai       one category
/help sticker  help for a single command
```

---

## How it works

```
src/
  router.js          shared dispatcher — no platform branching
  plugins/           552 commands — shared, unmodified
  adapters/
    telegram.js          adapter: lifecycle, polling, /-prefix handling
    telegram-socket.js   Baileys-shaped facade over the Telegram Bot API
    telegram-message.js  Telegram update → the same `details` object
  bot.js             WhatsApp (Baileys) adapter
```

`CommandRouter` hands every command a `context` object with `reply`, `send`,
`react` and `targetJid`. The Telegram adapter produces that identical object,
so plugins never learn which platform they are on. Adapters are imported
lazily — a Telegram-only deploy never loads Baileys.

### Platform differences

| Capability | WhatsApp | Telegram |
|---|---|---|
| Setup | session id from a pairing site | token from @BotFather |
| Ban risk | high (unofficial protocol) | none (official API) |
| Upload cap | 32 MB (`MEDIA_MAX_MB`) | up to 2 GB |
| Mentions | `@number` + mentions array | tappable `tg://user?id=` links |
| Kick | remove participant | ban + immediate unban, so they can rejoin |
| Add member | supported | not permitted — share the invite link |
| Block user | supported | not available; use a group ban |
| Profile/privacy commands | supported | managed through @BotFather |

Commands that cannot work on Telegram reply with a clear explanation rather
than failing silently.

---

## Troubleshooting

**Bot ignores everything in groups.** Run `/setprivacy` → Disable in BotFather,
then remove and re-add the bot to the group.

**"Telegram adapter idle: TELEGRAM_BOT_TOKEN is not set".** The variable is
missing or empty. Check for stray quotes or spaces around the token.

**409 Conflict in the logs.** The same token is polling from two places. Stop
the other instance — one token, one running process.

**Group admin commands fail.** Promote the bot to admin and grant it *Delete
messages* and *Ban users*.

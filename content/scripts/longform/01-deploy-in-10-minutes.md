# 🎬 Long-form #1 — "Deploy Your Own WhatsApp Bot in 10 Minutes (Free)"

- **Target length:** 8–10 minutes
- **Pillar:** 🛠️ Deploy — this is the highest-converting video you will make. It is the
  single video that turns viewers into forks. Re-record it every time the UI changes.
- **Thumbnail:** your face left, phone showing WhatsApp right, big text **10 MIN · FREE**
- **Publish:** Week 1, Sunday 4:00 PM WAT

---

## 🎯 Before you record — checklist

- [ ] Fresh browser profile (no personal tabs, no bookmarks bar with private stuff)
- [ ] A **throwaway** WhatsApp number for the demo — never your main
- [ ] Session ID ready to blur in the edit
- [ ] Screen recorder at 1080p, 30fps minimum
- [ ] Phone mirrored to screen (scrcpy or QuickTime) so viewers see WhatsApp live

---

## 📝 SCRIPT

### [0:00–0:12] COLD OPEN — no intro, show the payoff

> *[Screen: WhatsApp chat. You type `.menu`. Bot instantly replies with the full menu
> banner and command list.]*

**YOU:**
"That's a WhatsApp bot. Six hundred and thirty-three commands. It downloads music,
it generates AI images, it manages your group — and it costs zero naira to run.

In the next ten minutes I'm going to put this exact bot on *your* WhatsApp. No coding.
No credit card. Let's go."

> **Editing note:** absolutely no logo animation, no "welcome back to the channel."
> Every second before the payoff costs you retention.

---

### [0:12–0:50] WHAT YOU NEED

**YOU:**
"Three things, and you already have all of them.

One — a phone with WhatsApp. Any phone.
Two — a GitHub account. Free, takes thirty seconds to make.
Three — a Render account. Also free. That's the thing that keeps your bot online
twenty-four seven.

No laptop needed for most of this, by the way. I've done the whole thing from my phone
before. Alright — step one."

---

### [0:50–2:00] STEP 1 — FORK THE REPO

> *[Screen: github.com/MykelGoal/VENOM-MD-BOT]*

**YOU:**
"This is the VENOM MD repository. Link is in the description, pinned comment too.

See this button — **Fork**. Top right. Forking just means *make me my own copy*. Your
copy, your bot, your rules. Click it. Green button. Create fork.

And while you're here — genuinely, hit the star. It's the free thing you can do that
tells GitHub this project is worth showing to other people. Takes one click and it
helps me keep this free.

Done? You now have your own copy at your-username slash VENOM-MD-BOT. Step two."

> **Editing note:** zoom in hard on the Fork button and the Star button. Put a
> **⭐ CLICK THIS** arrow overlay on the star. This is the single highest-ROI
> two seconds in the entire video.

---

### [2:00–4:00] STEP 2 — GET YOUR SESSION ID

> *[Screen: session-site-2odn.onrender.com]*

**YOU:**
"Now the bot needs permission to use your WhatsApp. That's what a session ID is.

Go to this site — it's linked in the description. Two ways to connect: QR code, or
pairing code if you're on your phone.

I'll do pairing code. Type your number *with* your country code — mine is two-three-four
for Nigeria — but **no plus sign** and no spaces. Just digits.

Hit submit, and it gives you an eight-character code.

Now over on WhatsApp: Settings → Linked Devices → Link a Device → and down at the
bottom, **Link with phone number instead**. Type the code in.

*[pause]*

Connected. And now the site gives you your session ID — this long string right here.

**Listen carefully.** This string is the key to your WhatsApp account. Anyone who has
it can read your messages. Never send it to anyone. Never paste it in a group. Never
show it on a stream. I'm blurring mine right now for exactly that reason.

Copy it. Step three."

> **Editing note:** BLUR THE SESSION ID IN POST. Blur it frame by frame if you have to.
> Someone will pause the video. Treat this as non-negotiable.

---

### [4:00–7:00] STEP 3 — DEPLOY ON RENDER

> *[Screen: render.com]*

**YOU:**
"Render dot com. Sign up with GitHub — it's faster and it means Render can already see
your forked repo.

New → Web Service → Connect your VENOM-MD-BOT repo.

Now the settings. Runtime is Node. Build command is `npm ci`. Start command is
`npm start`. Instance type — **Free**. That's the one we want.

Scroll down to Environment Variables. This is the part people get wrong, so pay
attention. You need exactly two:

First — `SESSION_ID`. Paste the string you copied.

Second — `OWNER_NUMBER`. This is *your* WhatsApp number, country code, digits only,
no plus. If you leave this as the default you're literally making me the owner of your
bot, so — change it. Your number.

Create Web Service. And now we wait. First build takes about three minutes because it's
installing everything from scratch.

*[cut — jump to finished build]*

Look at the logs. `VENOM MD BOT connected`. That's it. Your bot is live."

---

### [7:00–8:30] STEP 4 — TEST IT

> *[Screen: WhatsApp]*

**YOU:**
"Let's prove it works. Open WhatsApp. Message yourself, or any chat.

`.menu`

*[bot replies with banner + full menu]*

There it is. Every command, sorted by category.

Let's try a real one. `.song` and then a song name.

*[bot returns audio]*

Downloaded. Straight into WhatsApp.

`.sticker` on a photo —

*[bot returns sticker]*

Instant. And that's two out of six hundred and thirty-three."

---

### [8:30–9:30] KEEPING IT ALIVE

**YOU:**
"One thing about free hosting: it falls asleep when nobody's using it. VENOM handles
most of that itself — it pings its own health endpoint every four minutes — but let's
add a backup.

UptimeRobot dot com. Free account. Add New Monitor. HTTP(S). Paste your Render URL and
add slash health on the end. Interval: five minutes. Save.

That's it. Your bot now stays awake permanently, for free, forever."

---

### [9:30–10:00] CTA — the part that actually matters

**YOU:**
"So that's a WhatsApp bot with six hundred and thirty-three commands, running
twenty-four seven, for free.

Three things before you go:

**Star the repo** — one click, it's the only payment I ask for.
**Fork it** so you've got your own copy.
**Subscribe** — I'm posting a new VENOM command every single day, and some of them are
genuinely ridiculous. Tomorrow's one identifies any song playing in a voice note.

Links to everything below. Any problem at all — Telegram group's in the description,
I answer there myself.

See you tomorrow."

---

## 📄 YouTube description

```
Deploy your own WhatsApp bot in 10 minutes — free, no coding, no credit card.
VENOM MD BOT has 633 commands: music downloads, AI, stickers, group management and more.

⏱️ TIMESTAMPS
0:00  What we're building
0:12  What you need
0:50  Step 1 — Fork the repo
2:00  Step 2 — Get your Session ID
4:00  Step 3 — Deploy on Render
7:00  Step 4 — Test your bot
8:30  Keep it online 24/7 for free
9:30  Wrap up

⭐ Star the repo: https://github.com/MykelGoal/VENOM-MD-BOT
🍴 Fork it: https://github.com/MykelGoal/VENOM-MD-BOT/fork
🔑 Get Session ID: https://session-site-2odn.onrender.com
💬 Telegram: https://t.me/+PYae7FAKkbEwM2E0
📱 WhatsApp Group: https://chat.whatsapp.com/CWpMOawc88e9DWGwfjW5Ia
📺 Subscribe: https://www.youtube.com/@venommdbot?sub_confirmation=1

⚠️ Never share your Session ID with anyone. It gives full access to your WhatsApp.
Use this bot only with accounts and groups you're authorised to manage.

#whatsappbot #baileys #nodejs #whatsapp #botdevelopment #venommd
```

## 📌 Pinned comment

```
Stuck anywhere? Drop your error below and I'll reply — I read every comment.

Two most common issues:
1. "Bad session" → your SESSION_ID was copied incomplete. Re-copy the whole string.
2. Bot doesn't respond → OWNER_NUMBER must be digits only, no + sign, with country code.

⭐ If this worked for you, star the repo — it genuinely helps:
https://github.com/MykelGoal/VENOM-MD-BOT
```

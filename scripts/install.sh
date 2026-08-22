#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# VENOM MD BOT — VPS quick installer (Ubuntu / Debian)
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/MykelGoal/VENOM-MD-BOT/main/scripts/install.sh)
#
# Checks/installs prerequisites (Node.js 20.18+, FFmpeg, git),
# clones the repository, installs dependencies and prepares .env
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/MykelGoal/VENOM-MD-BOT.git"
DIR="venom-md-bot"
NODE_MAJOR_MIN=20
NODE_MINOR_MIN=18

info() { printf '\033[1;32m[venom]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[venom]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[venom]\033[0m %s\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] && fail "Do not run as root — run as a normal user (the script uses sudo where needed)."

# 1 ── Node.js >= 20.18 ────────────────────────────────────────
need_node=1
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/^v//')"
  MAJOR="${NODE_VER%%.*}"
  MINOR="${NODE_VER#*.}"; MINOR="${MINOR%%.*}"
  if [ "$MAJOR" -gt "$NODE_MAJOR_MIN" ] || { [ "$MAJOR" -eq "$NODE_MAJOR_MIN" ] && [ "$MINOR" -ge "$NODE_MINOR_MIN" ]; }; then
    info "Node.js ${NODE_VER} found — good to go."
    need_node=0
  else
    warn "Node.js ${NODE_VER} is too old (need ${NODE_MAJOR_MIN}.${NODE_MINOR_MIN}+)."
  fi
fi
if [ "$need_node" -eq 1 ]; then
  warn "Installing Node.js 20.x via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  info "Node.js $(node -v) installed."
fi

# 2 ── FFmpeg ──────────────────────────────────────────────────
if command -v ffmpeg >/dev/null 2>&1; then
  info "FFmpeg found."
else
  warn "FFmpeg not found — installing (recommended for media commands)..."
  sudo apt-get update -y
  sudo apt-get install -y ffmpeg
  info "FFmpeg installed."
fi

# 3 ── git ─────────────────────────────────────────────────────
if ! command -v git >/dev/null 2>&1; then
  warn "git not found — installing..."
  sudo apt-get update -y
  sudo apt-get install -y git
fi

# 4 ── clone + setup ───────────────────────────────────────────
[ -e "$DIR" ] && fail "'$DIR' already exists here — remove it or run from another folder first."

info "Cloning VENOM MD BOT..."
git clone --depth 1 "$REPO_URL" "$DIR"
cd "$DIR"

info "Installing dependencies (npm ci)..."
npm ci --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  info "Created .env from .env.example."
fi

info "Setup complete!"
cat <<'EOF'

Next steps:
  1. cd venom-md-bot
  2. Edit .env and set at least:
       SESSION_ID    from https://session-site-2odn.onrender.com
       OWNER_NUMBER  your WhatsApp number with country code, digits only
  3. Run it:
       npm start
     Or run 24/7 with PM2:
       sudo npm i -g pm2
       pm2 start index.js --name venom
       pm2 startup && pm2 save
  4. Open your WhatsApp and send: .menu

EOF

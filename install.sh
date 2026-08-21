#!/usr/bin/env sh
set -eu
npm ci
npm test
printf '\nVENOM MD BOT dependencies installed successfully. Run: npm start\n'

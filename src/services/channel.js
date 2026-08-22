import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { logger } from "../logger.js";

const JID_PATTERN = /(\d{10,20})@newsletter/;
const CHANNEL_NAME = "VENOM MD Bot";

function isValidJid(value) {
  return /^\d{10,20}@newsletter$/.test(String(value || ""));
}

/**
 * Resolve the WhatsApp Channel JID used for the tappable channel chip.
 *
 * Resolution order: explicit CHANNEL_JID env var → local cache → fetch the
 * public channel page once and cache the result. Returns null when the JID
 * cannot be resolved; callers must simply omit the chip, never fail the
 * message because of it.
 */
export async function resolveChannelJid(config) {
  if (!config.channelUrl) return null;

  if (isValidJid(config.channelJid)) return config.channelJid;

  const cachePath = path.join(config.root, "data", "channel-jid.txt");
  try {
    const cached = (await readFile(cachePath, "utf8")).trim();
    if (isValidJid(cached)) return cached;
  } catch {
    // No cache yet — fall through to a live fetch.
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(config.channelUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    clearTimeout(timer);
    const html = response.ok ? await response.text() : "";
    const match = html.match(JID_PATTERN);
    if (match) {
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, match[0], "utf8");
      logger.info({ channel: match[0] }, "Resolved WhatsApp channel JID");
      return match[0];
    }
    logger.warn(
      { channel: config.channelUrl },
      "Channel page loaded but no JID found; channel chip disabled",
    );
  } catch (error) {
    logger.warn(
      { error: String(error?.message || error) },
      "Could not resolve channel JID; channel chip disabled",
    );
  }
  return null;
}

/** contextInfo that makes WhatsApp render a tappable channel chip. */
export function channelChip(jid) {
  if (!isValidJid(jid)) return {};
  return {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: jid,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1,
    },
  };
}

/** options for context.reply: the chip when the JID is known, else nothing. */
export function chipOptions(runtime) {
  const chip = channelChip(runtime?.channelJid);
  return Object.keys(chip).length ? { contextInfo: chip } : {};
}

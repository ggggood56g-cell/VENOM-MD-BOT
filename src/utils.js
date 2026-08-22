import { jidNormalizedUser } from "baileys";

export const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function formatDuration(totalSeconds) {
  let seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function normalizeJid(jid) {
  try {
    return jidNormalizedUser(String(jid || ""));
  } catch {
    return String(jid || "").split(":")[0];
  }
}

export function jidNumber(jid) {
  return normalizeJid(jid).split("@")[0].replace(/\D/g, "");
}

export function isOwnerJid(jid, owners) {
  const number = jidNumber(jid);
  return Boolean(number && owners.includes(number));
}

export function participantJids(participant = {}) {
  return [participant.id, participant.jid, participant.lid, participant.phoneNumber]
    .filter(Boolean)
    .map(normalizeJid);
}

export function sameParticipant(participant, jid) {
  const normalized = normalizeJid(jid);
  const number = jidNumber(jid);
  return participantJids(participant).some(
    (candidate) => candidate === normalized || (number && jidNumber(candidate) === number),
  );
}

export function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function clampText(value, maximum = 4_000) {
  return String(value || "").trim().slice(0, maximum);
}

export function extractUrls(text) {
  return String(text || "").match(/https?:\/\/[^\s<>{}\[\]"]+/gi) || [];
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

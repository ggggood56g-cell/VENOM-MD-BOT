import BRAND from "../System/Branding.js";

export const CREATOR = Object.freeze({
  name: BRAND.creator,
  number: BRAND.creatorNumber,
  jid: BRAND.creatorJid,
  github: BRAND.githubUrl,
  whatsapp: BRAND.whatsappUrl,
  youtube: BRAND.youtubeTutorial,
});

export const branding = Object.freeze({
  botName: BRAND.botName,
  shortName: BRAND.shortName,
  creator: BRAND.creator,
  ownerName: BRAND.creator,
  ownerNumber: BRAND.creatorNumber,
  github: BRAND.githubUrl,
  repo: BRAND.repository,
  whatsapp: BRAND.whatsappUrl,
  supportGroup: BRAND.supportGroup,
  youtube: BRAND.youtubeTutorial,
  logo: BRAND.logoPath,
});

export function creatorPromo(prefix = ".") {
  return (
    `💡 *New here?* Use *${prefix}menu <category>* or *${prefix}menu <command>* to learn what a command does.\n` +
    `🤖 *Want your own ${BRAND.shortName} bot?* Contact the original creator with *${prefix}owner*.\n` +
    `📞 ${BRAND.whatsappUrl}`
  );
}

export function contextInfo(extra = {}) {
  return {
    externalAdReply: {
      title: BRAND.botName,
      body: `Created by ${BRAND.creator}`,
      sourceUrl: BRAND.repository,
      mediaType: 1,
      renderLargerThumbnail: false,
    },
    ...extra,
  };
}

export default CREATOR;

const mergedCommands = [
  "say",
  "speak",
  "tts",
  "saybengali",
  "saybangla",
  "sayhindi",
  "sayja",
  "sayjapanese",
  "saykorean",
  "saychinese",
  "sayindo",
  "sayindonesian",
];

const languageByCommand = {
  say: "en",
  speak: "en",
  tts: "en",
  saybengali: "bn",
  saybangla: "bn",
  sayhindi: "hi",
  sayja: "ja",
  sayjapanese: "ja",
  saykorean: "ko",
  saychinese: "zh-CN",
  sayindo: "id",
  sayindonesian: "id",
};

export default {
  name: "texttospeech",
  alias: [...mergedCommands],
  uniquecommands: [
    "say",
    "saybengali",
    "sayhindi",
    "sayjapanese",
    "saykorean",
    "saychinese",
    "sayindo",
  ],
  description: "Text-to-speech commands",
  start: async (Venom, m, { inputCMD, text, prefix, doReact, isMedia }) => {
    const speechText = String(m.quoted?.text || text || "").trim();
    if (!speechText || isMedia) {
      await doReact("❔");
      return m.reply(
        `Please provide text or reply to a text message.\n\nExample: ${prefix}say VENOM MD is online`,
      );
    }
    if (speechText.length > 200) {
      return m.reply("Text-to-speech input must not exceed 200 characters.");
    }

    const language = languageByCommand[inputCMD];
    if (!language) return;

    await doReact("🪄");
    await Venom.sendPresenceUpdate("recording", m.from);
    try {
      const url = new URL("https://translate.google.com/translate_tts");
      url.search = new URLSearchParams({
        ie: "UTF-8",
        q: speechText,
        tl: language,
        total: "1",
        idx: "0",
        textlen: String(speechText.length),
        client: "tw-ob",
        prev: "input",
        ttsspeed: "1",
      }).toString();
      await Venom.sendMessage(
        m.from,
        { audio: { url: url.href }, mimetype: "audio/mpeg" },
        { quoted: m },
      );
    } catch (error) {
      console.error(`[ VENOM ] Text-to-speech failed: ${error.message}`);
      await doReact("❌");
      await m.reply("Text-to-speech is unavailable right now.");
    }
  },
};

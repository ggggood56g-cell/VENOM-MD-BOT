import {
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  proto,
} from "baileys";

export const serialize = (Venom, m, options = {}) => {
  if (!m) return m;
  let M = proto.WebMessageInfo;
  m = M.create(m);
  if (m.key) {
    m.from = jidNormalizedUser(m.key.remoteJid || m.key.participant);
    m.fromMe = m.key.fromMe;
    m.id = m.key.id;
    m.isBot = m.id.startsWith("BAE5") && m.id.length == 16;
    m.isGroup = m.from.endsWith("@g.us");
    m.sender = jidNormalizedUser(
      (m.fromMe && Venom.user?.id) || m.key.participant || m.from || ""
    );
  }
  if (m.message) {
    m.type = getContentType(m.message);
    m.message = extractMessageContent(m.message);
    m.msg = m.message[m.type];
    m.mentions = m.msg?.contextInfo ? m.msg?.contextInfo.mentionedJid : [];
    const contextInfo = m.msg?.contextInfo;
    const rawQuotedMessage = contextInfo?.quotedMessage;
    m.quoted = rawQuotedMessage || null;
    if (m.quoted) {
      m.quoted.type = getContentType(m.quoted);
      m.quoted.msg = m.quoted[m.quoted.type];
      m.quoted.mentions = m.quoted.msg?.contextInfo?.mentionedJid || [];
      m.quoted.id = contextInfo.stanzaId || "";
      m.quoted.sender = jidNormalizedUser(contextInfo.participant || m.sender);
      m.quoted.from = jidNormalizedUser(contextInfo.remoteJid || m.from);
      m.quoted.isGroup = m.quoted.from.endsWith("@g.us");
      m.quoted.isBot =
        m.quoted.id.startsWith("BAE5") && m.quoted.id.length === 16;
      m.quoted.fromMe =
        m.quoted.sender === jidNormalizedUser(Venom.user?.id || "");
      m.quoted.text =
        (typeof m.quoted.msg === "string" ? m.quoted.msg : "") ||
        m.quoted.msg?.text ||
        m.quoted.msg?.caption ||
        m.quoted.msg?.conversation ||
        m.quoted.msg?.contentText ||
        m.quoted.msg?.selectedDisplayText ||
        m.quoted.msg?.title ||
        "";
      const quotedKey = {
        remoteJid: m.quoted.from,
        fromMe: m.quoted.fromMe,
        id: m.quoted.id,
        ...(m.quoted.isGroup && m.quoted.sender
          ? { participant: m.quoted.sender }
          : {}),
      };
      const vM = (m.quoted.fakeObj = M.create({
        key: quotedKey,
        message: rawQuotedMessage,
      }));
      m.quoted.key = vM.key;
      m.quoted.delete = () =>
        Venom.sendMessage(m.quoted.from, { delete: vM.key });
      m.quoted.download = () => Venom.downloadMediaMessage(m.quoted.msg);
    }
  }
  m.download = (pathFile) => Venom.downloadMediaMessage(m.msg, pathFile);
  m.body = m.text =
    m.message?.conversation ||
    m.message?.[m.type]?.text ||
    m.message?.[m.type]?.caption ||
    m.message?.[m.type]?.contentText ||
    m.message?.[m.type]?.selectedDisplayText ||
    m.message?.[m.type]?.title ||
    "";
  m.reply = (text, chatId = m.from, options = {}) =>
    Buffer.isBuffer(text)
      ? Venom.sendFile(
          chatId,
          text,
          options.fileName || "file",
          m,
          options,
        )
      : Venom.sendText(chatId, text, m, options);

  return m;
};

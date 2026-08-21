import { publicHttp } from "../src/lib/network.js";

const MEDIA_FIELDS = ["image", "video", "audio", "document", "sticker"];
const configuredLimitMb = Number.parseInt(process.env.MEDIA_MAX_MB || "64", 10);
export const MAX_OUTBOUND_MEDIA_BYTES =
  (Number.isFinite(configuredLimitMb) && configuredLimitMb > 0
    ? Math.min(configuredLimitMb, 100)
    : 64) *
  1024 *
  1024;

/**
 * Resolve provider-returned media URLs through VENOM's guarded transport.
 * Baileys otherwise downloads `{ image: { url } }` itself, bypassing the
 * DNS/private-address and response-size protections used by command helpers.
 */
export async function materializePublicMedia(
  content,
  { http = publicHttp, maximumBytes = MAX_OUTBOUND_MEDIA_BYTES } = {},
) {
  if (!content || typeof content !== "object") return content;

  for (const field of MEDIA_FIELDS) {
    const media = content[field];
    const value = media && typeof media === "object" ? media.url : "";
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) continue;

    const limit = Math.max(
      1,
      Math.min(MAX_OUTBOUND_MEDIA_BYTES, Number(maximumBytes) || MAX_OUTBOUND_MEDIA_BYTES),
    );
    const response = await http.get(value, {
      timeout: 45_000,
      maxContentLength: limit,
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(response.data || []);
    if (!buffer.length) throw new Error("Remote media was empty.");
    if (buffer.length > limit) throw new Error("Remote media exceeds the configured size limit.");
    return { ...content, [field]: buffer };
  }

  return content;
}

export function protectSocketMedia(socket, options = {}) {
  if (!socket || typeof socket.sendMessage !== "function") {
    throw new TypeError("A WhatsApp socket with sendMessage() is required.");
  }
  const sendMessage = socket.sendMessage.bind(socket);
  socket.sendMessage = async (jid, content, sendOptions) =>
    sendMessage(jid, await materializePublicMedia(content, options), sendOptions);
  return socket;
}

export default { materializePublicMedia, protectSocketMedia };

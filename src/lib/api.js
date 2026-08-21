import { publicHttp as http } from "./network.js";

/**
 * Shared, SSRF-safe HTTP helper for restored commands. Requests may reach
 * public HTTP(S) services only; deployment-local addresses remain blocked
 * after DNS resolution and across redirects.
 */

/** GET JSON with a friendly error. */
export async function getJson(url, options = {}) {
  try {
    const { data } = await http.get(url, options);
    return data;
  } catch (error) {
    throw new Error(friendly(error));
  }
}

/** GET raw bytes (images, audio, video). */
export async function getBuffer(url, options = {}) {
  try {
    const { data } = await http.get(url, {
      ...options,
      responseType: "arraybuffer",
    });
    return Buffer.from(data);
  } catch (error) {
    throw new Error(friendly(error));
  }
}

/** Try several endpoints in order; first success wins. */
export async function race(sources) {
  const errors = [];
  for (const source of sources) {
    try {
      const result = await source();
      if (result) return result;
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`All sources failed. ${errors[0] || ""}`.trim());
}

function friendly(error) {
  if (/private network|public HTTP/i.test(error.message || "")) {
    return "Local and private network targets are not allowed.";
  }
  if (error.code === "ECONNABORTED") {
    return "The service took too long to respond.";
  }
  if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
    return "Could not reach the service (network/DNS).";
  }
  const status = error.response?.status;
  if (status === 404) return "Nothing found for that query.";
  if (status === 429) return "Rate limited - try again in a minute.";
  if (status >= 500) return "The service is having problems right now.";
  return error.message || "Request failed.";
}

export { http };
export default { http, getJson, getBuffer, race };

const DEFAULT_MAXIMUM = 4 * 1024 * 1024;

function hostAllowed(hostname, allowedHosts) {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const normalized = allowed.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

async function request(url, {
  allowedHosts,
  maximumBytes = DEFAULT_MAXIMUM,
  timeout = 15_000,
  headers = {},
  redirects = 2,
} = {}) {
  const target = new URL(url);
  if (target.protocol !== "https:" || !hostAllowed(target.hostname, allowedHosts || [])) {
    throw new Error("Remote service URL is not trusted.");
  }
  const response = await fetch(target, {
    headers: {
      accept: "application/json, image/*;q=0.9, */*;q=0.5",
      "user-agent": "VENOM-MD-BOT/2.0",
      ...headers,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects <= 0) throw new Error("Remote service redirected too many times.");
    const location = response.headers.get("location");
    if (!location) throw new Error("Remote service returned an invalid redirect.");
    return request(new URL(location, target).toString(), {
      allowedHosts,
      maximumBytes,
      timeout,
      headers,
      redirects: redirects - 1,
    });
  }
  if (!response.ok) throw new Error(`Remote service failed (${response.status}).`);

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximumBytes) throw new Error("Remote response is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Remote service returned an empty response.");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("Remote response is too large.");
    }
    chunks.push(value);
  }
  return {
    buffer: Buffer.concat(chunks, total),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function fetchJson(url, options) {
  const { buffer } = await request(url, options);
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error("Remote service returned invalid JSON.");
  }
}

export async function fetchBuffer(url, options) {
  return request(url, options);
}

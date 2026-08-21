import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import axios from "axios";

export const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 200 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

const publicIpv6 = new net.BlockList();
publicIpv6.addSubnet("2000::", 3, "ipv6");
const blockedIpv6 = new net.BlockList();
for (const [address, prefix] of [
  ["2001:db8::", 32], // documentation
  ["2001:2::", 48], // benchmark testing
  ["2001::", 32], // Teredo transition addresses
  ["2001:20::", 28], // ORCHID, not globally routable
]) {
  blockedIpv6.addSubnet(address, prefix, "ipv6");
}

function normalizedHostname(value) {
  const hostname = String(value || "").toLowerCase().replace(/\.$/, "");
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function bounded(value, maximum) {
  return Number.isFinite(value) && value >= 0 ? Math.min(value, maximum) : maximum;
}

function ipv4Number(address) {
  return address
    .split(".")
    .reduce((value, octet) => (value * 256 + Number(octet)) >>> 0, 0);
}

function inV4Range(value, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (ipv4Number(base) & mask);
}

/** Return true for non-routable, local, documentation, and multicast IPs. */
export function isPrivateAddress(address) {
  let value = String(address || "").trim().toLowerCase();
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);

  if (net.isIP(value) === 4) {
    const numeric = ipv4Number(value);
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, bits]) => inV4Range(numeric, base, bits));
  }

  if (net.isIP(value) === 6) {
    // Only global unicast IPv6 is eligible. This conservatively rejects local,
    // mapped IPv4, NAT64, transition, multicast, and other special-use space.
    return (
      !publicIpv6.check(value, "ipv6") || blockedIpv6.check(value, "ipv6")
    );
  }

  return true;
}

function validateUrlShape(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("A valid public HTTP or HTTPS URL is required");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only public HTTP and HTTPS URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs containing credentials are not allowed");
  }

  const hostname = normalizedHostname(parsed.hostname);
  const ipFamily = net.isIP(hostname);
  if (
    !hostname ||
    hostname === "localhost" ||
    (!ipFamily && !hostname.includes(".")) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local and private network targets are not allowed");
  }
  if (ipFamily && isPrivateAddress(hostname)) {
    throw new Error("Local and private network targets are not allowed");
  }
  return parsed;
}

/** Synchronous redirect validation; DNS redirects are checked by the agents. */
export function assertPublicRedirect(options = {}) {
  if (options.auth) throw new Error("URLs containing credentials are not allowed");
  const protocol = options.protocol || "https:";
  const hostname = normalizedHostname(options.hostname || options.host);
  const formattedHost = net.isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  const port = options.port ? `:${options.port}` : "";
  validateUrlShape(`${protocol}//${formattedHost}${port}${options.path || "/"}`);
}

function lookupPublic(hostname, options, callback) {
  const requested =
    typeof options === "number" ? { family: options } : { ...(options || {}) };
  dns.lookup(
    hostname,
    { family: requested.family || 0, all: true, verbatim: true },
    (error, addresses) => {
      if (error) return callback(error);
      if (!addresses?.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        return callback(new Error("Local and private network targets are not allowed"));
      }
      if (requested.all) return callback(null, addresses);
      const selected = addresses[0];
      return callback(null, selected.address, selected.family);
    },
  );
}

export const publicHttpAgent = new http.Agent({
  keepAlive: true,
  lookup: lookupPublic,
});
export const publicHttpsAgent = new https.Agent({
  keepAlive: true,
  lookup: lookupPublic,
});

/** Validate the URL and its current DNS answers before starting a request. */
export async function assertPublicHttpUrl(value) {
  const parsed = validateUrlShape(value);
  const hostname = normalizedHostname(parsed.hostname);
  if (net.isIP(hostname)) return parsed;
  const addresses = await dns.promises.lookup(hostname, {
    all: true,
    verbatim: true,
  });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Local and private network targets are not allowed");
  }
  return parsed;
}

/**
 * Axios instance shared by restored commands. Proxy inheritance is disabled
 * and a guarded DNS resolver is retained across redirects, preventing chat
 * input or third-party media URLs from reaching deployment-local services.
 */
export const publicHttp = axios.create({
  timeout: 25_000,
  maxRedirects: MAX_REDIRECTS,
  maxContentLength: MAX_RESPONSE_BYTES,
  maxBodyLength: MAX_REQUEST_BYTES,
  beforeRedirect: assertPublicRedirect,
  proxy: false,
  httpAgent: publicHttpAgent,
  httpsAgent: publicHttpsAgent,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
  },
  validateStatus: (status) => status >= 200 && status < 400,
});

publicHttp.interceptors.request.use(async (request) => {
  const target = new URL(request.url || "", request.baseURL);
  await assertPublicHttpUrl(target);
  request.proxy = false;
  request.httpAgent = publicHttpAgent;
  request.httpsAgent = publicHttpsAgent;
  request.beforeRedirect = assertPublicRedirect;
  request.maxRedirects = bounded(request.maxRedirects, MAX_REDIRECTS);
  request.maxContentLength = bounded(
    request.maxContentLength,
    MAX_RESPONSE_BYTES,
  );
  request.maxBodyLength = bounded(request.maxBodyLength, MAX_REQUEST_BYTES);
  return request;
});

export default {
  assertPublicHttpUrl,
  isPrivateAddress,
  publicHttp,
  publicHttpAgent,
  publicHttpsAgent,
};

/**
 * Credential-safe MongoDB helpers retained for command compatibility.
 * Runtime/database credential changes are intentionally unavailable; configure
 * MONGODB or MONGO_URI only through the private deployment environment.
 */

export function looksLikeMongoUri(value) {
  return /^mongodb(?:\+srv)?:\/\//i.test(String(value || "").trim());
}

export function maskMongoUri(value) {
  const uri = String(value || "").trim();
  if (!uri) return "not configured";
  try {
    const parsed = new URL(uri);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return uri.replace(/(mongodb(?:\+srv)?:\/\/)[^@/]+@/i, "$1***:***@");
  }
}

export function dbNameFromUri(value) {
  try {
    const pathname = new URL(String(value || "")).pathname.replace(/^\//, "");
    return pathname.split("/")[0] || "";
  } catch {
    return "";
  }
}

export function readMongoOverride() {
  return { uri: "", dbName: "", setAt: null };
}

export function writeMongoOverride() {
  throw new Error(
    "MongoDB credentials must be configured in the private deployment environment",
  );
}

export function clearMongoOverride() {
  return false;
}

export default {
  looksLikeMongoUri,
  maskMongoUri,
  dbNameFromUri,
  readMongoOverride,
  writeMongoOverride,
  clearMongoOverride,
};

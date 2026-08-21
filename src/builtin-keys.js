/**
 * Credential-free compatibility shim.
 *
 * Historical VENOM revisions bundled provider and database credentials in
 * source. They are intentionally not restored. Configure credentials only
 * through deployment environment variables documented in .env.example.
 */
export const BUILTIN_KEYS = Object.freeze({});

export function builtinKey(name) {
  const key = String(name || "").trim();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key)) return "";
  return String(process.env[key] || "").trim();
}

export function applyBuiltinKeys() {
  return [];
}

export default BUILTIN_KEYS;

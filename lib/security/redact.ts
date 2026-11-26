/**
 * Redacts secrets from values before they are logged. Use `logSafe` instead of
 * console.* for anything that might contain provider responses or errors.
 */
const SECRET_KEYS = /token|secret|authorization|password|code_verifier|refresh|access|cookie|apikey|api_key/i;
const BEARER = /(bearer\s+)[a-z0-9\-._~+/]+=*/gi;
const JWT = /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (typeof value === "string") return value.replace(BEARER, "$1[REDACTED]").replace(JWT, "[REDACTED_JWT]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

export const logSafe = {
  info: (msg: string, meta?: unknown) => console.info(`[familypulse] ${msg}`, meta === undefined ? "" : redact(meta)),
  warn: (msg: string, meta?: unknown) => console.warn(`[familypulse] ${msg}`, meta === undefined ? "" : redact(meta)),
  error: (msg: string, meta?: unknown) => console.error(`[familypulse] ${msg}`, meta === undefined ? "" : redact(meta)),
};

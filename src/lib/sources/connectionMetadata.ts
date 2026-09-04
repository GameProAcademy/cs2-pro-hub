/**
 * Phase 2.1.2.1 — `player_connections.metadata` is NON-SENSITIVE metadata.
 *
 * It exists to store harmless descriptive information (nickname, public profile
 * URL, why a sync was requested). It must NEVER become a credential store.
 *
 * This validator is the application-side half of the guarantee; the database
 * trigger `guard_connection_status()` enforces the same rule through
 * `public.jsonb_has_sensitive_key()`, so a direct Data-API write cannot bypass
 * it either. No token storage, vault or OAuth exists in this phase.
 */

/** Normalised (letters/digits only, lower-cased) forbidden key names. */
const FORBIDDEN_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "token",
  "tokens",
  "apikey",
  "apisecret",
  "clientsecret",
  "clientid",
  "secret",
  "secrets",
  "authorization",
  "auth",
  "cookie",
  "cookies",
  "session",
  "sessionid",
  "password",
  "passwd",
  "bearer",
  "credential",
  "credentials",
  "privatekey",
  "publickey",
  "signature",
  "jwt",
  "otp",
  "pin",
]);

/** Substrings that make a key sensitive whatever the surrounding wording is. */
const FORBIDDEN_FRAGMENTS = [
  "token",
  "secret",
  "password",
  "cookie",
  "credential",
  "apikey",
  "privatekey",
  "bearer",
  "authorization",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveMetadataKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (FORBIDDEN_KEYS.has(normalized)) return true;
  return FORBIDDEN_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export type MetadataValidation =
  { ok: true } | { ok: false; reason: "not_an_object" | "sensitive_key"; key?: string };

/**
 * Validates connection metadata recursively. Rejects sensitive keys at any
 * depth, case-insensitively and independently of separators
 * (`access_token`, `refreshToken`, `API-KEY`, `Authorization` ...).
 */
export function validateConnectionMetadata(value: unknown): MetadataValidation {
  if (value === null || value === undefined) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "not_an_object" };
  }

  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (current === null || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      if (isSensitiveMetadataKey(key)) return { ok: false, reason: "sensitive_key", key };
      if (nested !== null && typeof nested === "object") stack.push(nested);
    }
  }
  return { ok: true };
}

/** Throws on invalid metadata. Use this on the server before persisting. */
export function assertSafeConnectionMetadata(value: unknown): void {
  const result = validateConnectionMetadata(value);
  if (result.ok) return;
  if (result.reason === "not_an_object") {
    throw new Error("CONNECTION_METADATA_INVALID");
  }
  throw new Error("CONNECTION_METADATA_SENSITIVE");
}

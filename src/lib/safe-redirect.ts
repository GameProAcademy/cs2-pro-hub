/**
 * Redirect-origin allowlist (server-side).
 *
 * A client-supplied URL is NEVER trusted: `new URL(input).origin` only proves
 * the string parses, not that the host belongs to this application. Every
 * redirect destination handed to Supabase Auth must match an explicitly
 * allowed origin, and the path is always normalised by the backend.
 */

/**
 * Origins that belong to this application. Configure production/preview hosts
 * through `APP_ALLOWED_ORIGINS` (comma separated) or `APP_URL`; nothing here is
 * a secret and no wildcard/subdomain matching is performed.
 */
function envOrigins(): string[] {
  const raw = [
    process.env["APP_ALLOWED_ORIGINS"] ?? "",
    process.env["APP_URL"] ?? "",
    process.env["PUBLIC_APP_URL"] ?? "",
  ]
    .join(",")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const origins: string[] = [];
  for (const value of raw) {
    try {
      origins.push(new URL(value).origin);
    } catch {
      // Ignore malformed configuration instead of widening the allowlist.
    }
  }
  return origins;
}

/** Local development origins, only outside production. */
const DEV_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"];

export function allowedAppOrigins(): string[] {
  const isProduction = process.env["NODE_ENV"] === "production";
  const configured = envOrigins();
  return [...new Set(isProduction ? configured : [...configured, ...DEV_ORIGINS])];
}

export class UnsafeRedirectError extends Error {
  constructor() {
    super("UNSAFE_REDIRECT");
    this.name = "UnsafeRedirectError";
  }
}

/**
 * Validates a candidate origin against the allowlist and returns the canonical
 * password-recovery URL. Any path, query or fragment supplied by the client is
 * discarded; only `https` is accepted (plus explicit local dev origins).
 */
export function safeResetPasswordUrl(
  candidate: unknown,
  allowed: string[] = allowedAppOrigins(),
): string {
  if (typeof candidate !== "string" || candidate.length === 0) throw new UnsafeRedirectError();

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new UnsafeRedirectError();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeRedirectError();
  if (url.protocol === "http:" && !DEV_ORIGINS.includes(url.origin)) {
    throw new UnsafeRedirectError();
  }
  if (!allowed.includes(url.origin)) throw new UnsafeRedirectError();

  return `${url.origin}/reset-password`;
}

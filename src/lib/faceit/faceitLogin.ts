/** PM5 — fixed result codes of "Continue with FACEIT" (shared by the server and the login page). */
export const FACEIT_LOGIN_REASONS = [
  "not_configured",
  "cancelled",
  "expired",
  "browser_mismatch",
  "email_not_verified",
  "account_exists",
  "duplicate_account",
  "rate_limited",
  "temporary",
  "failed",
] as const;
export type FaceitLoginReason = (typeof FACEIT_LOGIN_REASONS)[number];

/**
 * Reads the one-time session hand-over from the URL fragment of `/auth/faceit`. Only a
 * well-formed token hash of type `magiclink` is accepted.
 */
export function parseFaceitHandover(hash: string): { tokenHash: string; created: boolean } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const tokenHash = params.get("token_hash") ?? "";
  if (params.get("type") !== "magiclink" || !/^[A-Za-z0-9_-]{16,256}$/.test(tokenHash)) return null;
  return { tokenHash, created: params.get("new") === "1" };
}

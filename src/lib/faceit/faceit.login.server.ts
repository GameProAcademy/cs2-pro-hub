/**
 * PM5 — "Continue with FACEIT" (sign in / sign up with FACEIT). SERVER ONLY.
 *
 * Start (`GET /faceit/login`): a random browser-binding nonce is set as an HttpOnly, Secure,
 * SameSite=Lax cookie scoped to /faceit, its SHA-256 is stored with a LOGIN OAuth state
 * (PKCE S256, single use, 10 minutes) and the browser is sent to FACEIT. The start always runs on
 * the origin of the registered redirect URI, so the cookie comes back to the callback.
 *
 * Callback (LOGIN attempt): the cookie must match the stored hash (login-CSRF defence), the code
 * is exchanged server-to-server and the FACEIT account id comes from userinfo. Then:
 *   1. a CS2 PRO account already CONNECTED to this FACEIT account → that account is signed in;
 *   2. otherwise a NEW account is created ONLY when FACEIT states a verified e-mail
 *      (`email_verified: true`) that no CS2 PRO account uses; the FACEIT account is linked to
 *      it and a first sync is queued;
 *   3. an existing account is NEVER linked by e-mail or nickname: if the e-mail is in use the
 *      player is asked to sign in normally and connect FACEIT from the Analysis page.
 * The session is handed over as a one-time Supabase magic-link token hash in the URL FRAGMENT
 * of a fixed internal page (`/auth/faceit`), which is never sent to a server or logged; the page
 * exchanges it with `verifyOtp`. No token, code, state or e-mail is ever logged.
 */
import { FaceitError, toFaceitError, type FaceitErrorCode } from "./faceit.errors";
import type { ConsumedAttempt } from "./faceit.oauth.server";
import { hashState } from "./faceit.oauth";
import type { FaceitLoginReason } from "./faceitLogin";

export const FACEIT_LOGIN_COOKIE = "cs2pro_faceit_login";
const COOKIE_PATH = "/faceit";
const COOKIE_MAX_AGE = 600;

export type { FaceitLoginReason };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

function bindingCookie(value: string, maxAge: number): string {
  return `${FACEIT_LOGIN_COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function loginErrorPath(reason: FaceitLoginReason): string {
  return `/login?faceit=${reason}`;
}

function reasonFor(error: unknown): FaceitLoginReason {
  const code = toFaceitError(error).code;
  switch (code) {
    case "FACEIT_CONFIGURATION_MISSING":
      return "not_configured";
    case "FACEIT_OAUTH_ACCESS_DENIED":
      return "cancelled";
    case "FACEIT_OAUTH_STATE_EXPIRED":
    case "FACEIT_OAUTH_INVALID_GRANT":
    case "FACEIT_OAUTH_STATE_INVALID":
    case "FACEIT_OAUTH_STATE_CONSUMED":
    case "FACEIT_OAUTH_MISSING_CODE":
      return "expired";
    case "FACEIT_DUPLICATE_ACCOUNT":
      return "duplicate_account";
    case "FACEIT_RATE_LIMITED":
      return "rate_limited";
    case "FACEIT_TEMPORARY_ERROR":
    case "FACEIT_TIMEOUT":
    case "FACEIT_NETWORK_ERROR":
      return "temporary";
    default:
      return "failed";
  }
}

/** `GET /faceit/login` */
export async function handleFaceitLoginStart(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  try {
    const { requireFaceitOAuthConfig } = await import("./faceit.config.server");
    const config = requireFaceitOAuthConfig();
    // The cookie must be set on the origin FACEIT will redirect back to.
    const canonical = new URL(config.redirectUri).origin;
    if (canonical !== origin) return redirect(new URL("/faceit/login", canonical).toString());
    const nonce = randomNonce();
    const { startFaceitLoginAttempt } = await import("./faceit.oauth.server");
    const attempt = await startFaceitLoginAttempt(await hashState(nonce));
    console.info("[faceit] faceit_login_attempt");
    return redirect(attempt.authorizeUrl, bindingCookie(nonce, COOKIE_MAX_AGE));
  } catch (error) {
    const reason = reasonFor(error);
    console.warn(`[faceit] faceit_login_failure reason=${reason}`);
    return redirect(new URL(loginErrorPath(reason), origin).toString());
  }
}

/** Is `email` used by any CS2 PRO account? Exact, case-insensitive, via the auth admin API. */
async function emailInUse(email: string): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .ilike("email", email.replace(/([%_\\])/g, "\\$1"))
    .limit(1);
  if (error) throw new FaceitError("FACEIT_INTERNAL_ERROR");
  return (data ?? []).length > 0;
}

/** One-time session hand-over for `userId` (magic-link token hash; never logged). */
async function sessionTokenHash(userId: string): Promise<string> {
  const db = await admin();
  const { data: user, error } = await db.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (error || !email) throw new FaceitError("FACEIT_INTERNAL_ERROR");
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new FaceitError("FACEIT_INTERNAL_ERROR");
  return hash;
}

function sessionPath(tokenHash: string, created: boolean): string {
  return `/auth/faceit#token_hash=${encodeURIComponent(tokenHash)}&type=magiclink${created ? "&new=1" : ""}`;
}

/** Callback of a LOGIN attempt (state already consumed by the caller). */
export async function completeFaceitLogin(
  request: Request,
  attempt: ConsumedAttempt,
  code: string | null,
  oauthError?: FaceitErrorCode,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  const clear = bindingCookie("", 0);
  const fail = (reason: FaceitLoginReason) => {
    console.warn(`[faceit] faceit_login_failure reason=${reason}`);
    return redirect(new URL(loginErrorPath(reason), origin).toString(), clear);
  };
  if (oauthError) return fail(oauthError === "FACEIT_OAUTH_ACCESS_DENIED" ? "cancelled" : "failed");
  try {
    const cookie = readCookie(request, FACEIT_LOGIN_COOKIE);
    if (
      !cookie ||
      !attempt.browserBindingHash ||
      (await hashState(cookie)) !== attempt.browserBindingHash
    )
      return fail("browser_mismatch");
    if (!code) return fail("expired");

    const { exchangeFaceitCode, resolveFaceitAccount } = await import("./faceit.oauth.server");
    const token = await exchangeFaceitCode(code, attempt.codeVerifier, attempt.redirectUri);
    const account = await resolveFaceitAccount(token.accessToken);
    const db = await admin();

    // 1. An account already connected to this FACEIT account signs in.
    const { data: connection } = await db
      .from("player_connections")
      .select("player_id")
      .eq("source", "faceit")
      .eq("connection_type", "oauth")
      .eq("status", "connected")
      .eq("external_id", account.playerId)
      .maybeSingle();
    if (connection) {
      const { data: player } = await db
        .from("player_profiles")
        .select("user_id")
        .eq("id", connection.player_id)
        .maybeSingle();
      if (!player?.user_id) return fail("failed");
      const hash = await sessionTokenHash(player.user_id);
      console.info("[faceit] faceit_login_success kind=existing");
      return redirect(new URL(sessionPath(hash, false), origin).toString(), clear);
    }

    // 2. New account only with a FACEIT-verified e-mail that nobody uses.
    if (!account.email || !account.emailVerified) return fail("email_not_verified");
    if (await emailInUse(account.email)) return fail("account_exists");
    const created = await db.auth.admin.createUser({
      email: account.email,
      email_confirm: true,
      user_metadata: {
        nickname: account.nickname,
        display_name: account.nickname,
        signup_source: "faceit",
      },
    });
    if (created.error || !created.data.user) {
      // A concurrent sign-up with the same e-mail lost the race: never link to it.
      return fail("account_exists");
    }
    const userId = created.data.user.id;
    try {
      const { finalizeFaceitConnection } = await import("./faceit.connect.server");
      const { enqueueFaceitSync } = await import("./faceit.sync.server");
      const result = await finalizeFaceitConnection(userId, account.playerId);
      await enqueueFaceitSync(result.playerId, result.connectionId, "initial");
    } catch (error) {
      // No half-created account is left behind.
      await db.auth.admin.deleteUser(userId).catch(() => undefined);
      throw error;
    }
    const hash = await sessionTokenHash(userId);
    console.info("[faceit] faceit_login_success kind=created");
    return redirect(new URL(sessionPath(hash, true), origin).toString(), clear);
  } catch (error) {
    return fail(reasonFor(error));
  }
}

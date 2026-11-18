/**
 * FASE 2.2.1 / PM5 — FACEIT OAuth callback handler (server-side only), shared by the routes
 * `/api/public/integrations/faceit/callback` (Fase 2.2.1) and `/faceit/callback` (the redirect
 * URI registered in the FACEIT App Studio for production, PM5). A LOGIN attempt (PM5, "Continue
 * with FACEIT") is handed to `faceit.login.server.ts`; a LINK attempt keeps the flow below.
 *
 * The user is identified by the server-side OAuth state, never by a browser parameter. The state
 * is validated, bound to the user who started the flow, single-use and short-lived. The redirect
 * target is a fixed internal path (no open redirect) and never carries a token, code, state,
 * secret or upstream response body.
 */
import {
  callbackReason,
  faceitErrorFromOAuthParam,
  toFaceitError,
} from "@/lib/faceit/faceit.errors";

// PM5: the FACEIT card lives on /profile (next to Steam) in real-data mode.
const SUCCESS_PATH = "/profile?connection=faceit_success";

function errorPath(reason: string): string {
  return `/profile?connection=faceit_error&reason=${encodeURIComponent(reason)}`;
}

function redirectTo(request: Request, path: string): Response {
  const target = new URL(path, new URL(request.url).origin);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export async function handleFaceitCallback(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const oauthError = params.get("error");
  const state = params.get("state");
  const code = params.get("code");

  if (oauthError) {
    // The attempt is burned even on the error path: no replay window.
    const { consumeFaceitOAuthStateQuietly } = await import("@/lib/faceit/faceit.oauth.server");
    const burned = await consumeFaceitOAuthStateQuietly(state);
    const mapped = faceitErrorFromOAuthParam(oauthError);
    if (burned?.purpose === "login") {
      // PM5: a cancelled / failed FACEIT sign-in goes back to the login page.
      const { completeFaceitLogin } = await import("@/lib/faceit/faceit.login.server");
      return completeFaceitLogin(request, burned, null, mapped);
    }
    console.warn(`[faceit] faceit_connection_failure code=${mapped}`);
    return redirectTo(request, errorPath(callbackReason(mapped)));
  }

  try {
    const { consumeFaceitOAuthState, exchangeFaceitCode, resolveFaceitPlayerId } =
      await import("@/lib/faceit/faceit.oauth.server");
    const { finalizeFaceitConnection } = await import("@/lib/faceit/faceit.connect.server");
    const { enqueueFaceitSync } = await import("@/lib/faceit/faceit.sync.server");

    if (!state) {
      return redirectTo(request, errorPath(callbackReason("FACEIT_OAUTH_STATE_INVALID")));
    }
    const attempt = await consumeFaceitOAuthState(state);
    if (attempt.purpose === "login") {
      // PM5: sign in / sign up with FACEIT (see faceit.login.server.ts).
      const { completeFaceitLogin } = await import("@/lib/faceit/faceit.login.server");
      return completeFaceitLogin(request, attempt, code);
    }
    if (!attempt.userId) {
      return redirectTo(request, errorPath(callbackReason("FACEIT_OAUTH_STATE_INVALID")));
    }
    if (!code) {
      return redirectTo(request, errorPath(callbackReason("FACEIT_OAUTH_MISSING_CODE")));
    }

    const { recordFaceitOAuthFailure } = await import("@/lib/faceit/faceit.diagnostics.server");
    let stage: "token" | "userinfo" | "link" | "sync" = "token";
    try {
      const token = await exchangeFaceitCode(code, attempt.codeVerifier, attempt.redirectUri);
      stage = "userinfo";
      const faceitPlayerId = await resolveFaceitPlayerId(token.accessToken);
      stage = "link";
      const result = await finalizeFaceitConnection(attempt.userId, faceitPlayerId);

      // Synchronisation NEVER runs inside this request: we enqueue and
      // redirect. The cron worker claims and executes the job.
      stage = "sync";
      await enqueueFaceitSync(
        result.playerId,
        result.connectionId,
        result.reconnected ? "incremental" : "initial",
      );
    } catch (error) {
      await recordFaceitOAuthFailure("link", stage, error);
      throw error;
    }

    console.info("[faceit] faceit_connection_success");
    return redirectTo(request, SUCCESS_PATH);
  } catch (error) {
    const faceitError = toFaceitError(error);
    console.warn(`[faceit] faceit_connection_failure code=${faceitError.code}`);
    return redirectTo(request, errorPath(callbackReason(faceitError.code)));
  }
}

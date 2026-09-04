/**
 * FASE 2.2.1 — FACEIT OAuth callback (server-side only).
 *
 * Public route on purpose: FACEIT redirects the browser here and the app session
 * lives in localStorage, so the user is identified by the server-side OAuth
 * state, never by a browser parameter. The state is validated, bound to the user
 * who started the flow, single-use and short-lived.
 *
 * The redirect target is a fixed internal path (no open redirect) and never
 * carries a token, code, state, secret or upstream response body.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  callbackReason,
  faceitErrorFromOAuthParam,
  toFaceitError,
} from "@/lib/faceit/faceit.errors";

const SUCCESS_PATH = "/analysis?connection=faceit_success";

function errorPath(reason: string): string {
  return `/analysis?connection=faceit_error&reason=${encodeURIComponent(reason)}`;
}

function redirectTo(request: Request, path: string): Response {
  const target = new URL(path, new URL(request.url).origin);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export const Route = createFileRoute("/api/public/integrations/faceit/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const oauthError = params.get("error");
        const state = params.get("state");
        const code = params.get("code");

        if (oauthError) {
          // The attempt is burned even on the error path: no replay window.
          const { consumeFaceitOAuthStateQuietly } = await import(
            "@/lib/faceit/faceit.oauth.server"
          );
          await consumeFaceitOAuthStateQuietly(state);
          const mapped = faceitErrorFromOAuthParam(oauthError);
          console.warn(`[faceit] faceit_connection_failure code=${mapped}`);
          return redirectTo(request, errorPath(callbackReason(mapped)));
        }

        try {
          const { consumeFaceitOAuthState, exchangeFaceitCode, resolveFaceitPlayerId } =
            await import("@/lib/faceit/faceit.oauth.server");
          const { finalizeFaceitConnection } = await import("@/lib/faceit/faceit.connect.server");
          const { enqueueFaceitSync, processNextFaceitSyncJob } = await import(
            "@/lib/faceit/faceit.sync.server"
          );

          if (!state) {
            return redirectTo(request, errorPath(callbackReason("FACEIT_OAUTH_STATE_INVALID")));
          }
          const attempt = await consumeFaceitOAuthState(state);
          if (!code) {
            return redirectTo(request, errorPath(callbackReason("FACEIT_OAUTH_MISSING_CODE")));
          }

          const token = await exchangeFaceitCode(code, attempt.codeVerifier, attempt.redirectUri);
          const faceitPlayerId = await resolveFaceitPlayerId(token.accessToken);
          const result = await finalizeFaceitConnection(attempt.userId, faceitPlayerId);

          // Synchronisation NEVER runs inside this request.
          const queued = await enqueueFaceitSync(
            result.playerId,
            result.connectionId,
            result.reconnected ? "incremental" : "initial",
          );
          if (!queued.alreadyRunning) void processNextFaceitSyncJob().catch(() => undefined);

          console.info("[faceit] faceit_connection_success");
          return redirectTo(request, SUCCESS_PATH);
        } catch (error) {
          const faceitError = toFaceitError(error);
          console.warn(`[faceit] faceit_connection_failure code=${faceitError.code}`);
          return redirectTo(request, errorPath(callbackReason(faceitError.code)));
        }
      },
    },
  },
});

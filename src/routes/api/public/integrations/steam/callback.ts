/**
 * FASE 2.5 — Steam OpenID 2.0 callback (server-side only).
 *
 * Public route on purpose: Steam redirects the browser here and the app session
 * lives in localStorage, so the user is identified by our server-side link
 * attempt, never by a browser parameter. The attempt is validated, bound to the
 * user who started it, single-use and short-lived.
 *
 * The redirect target is a fixed internal path (no open redirect) and never
 * carries a SteamID64, a state, a signature or an upstream body.
 */
import { createFileRoute } from "@tanstack/react-router";

import { callbackReason, toSteamError } from "@/lib/steam/steam.errors";

const SUCCESS_PATH = "/profile?connection=steam_success";

function errorPath(reason: string): string {
  return `/profile?connection=steam_error&reason=${encodeURIComponent(reason)}`;
}

function redirectTo(request: Request, path: string): Response {
  const target = new URL(path, new URL(request.url).origin);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export const Route = createFileRoute("/api/public/integrations/steam/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { paramsToRecord } = await import("@/lib/steam/steam.openid");

        try {
          // FASE 2.5.1 — reject oversized / over-wide payloads before touching
          // the database or calling Steam. Cheapest possible abuse defence.
          const { assertCallbackPayloadWithinLimits } = await import("@/lib/steam/steam.limits");
          assertCallbackPayloadWithinLimits(url);
          const record = paramsToRecord(url.searchParams);

          const { validateSteamCallback } = await import("@/lib/steam/steam.openid.server");
          const { finalizeSteamConnection } = await import("@/lib/steam/steam.connect.server");

          const assertion = await validateSteamCallback(record);
          await finalizeSteamConnection(assertion.userId, assertion.steamId64);
          return redirectTo(request, SUCCESS_PATH);
        } catch (error) {
          const steamError = toSteamError(error);
          // Code only: no SteamID64, no signature, no upstream body.
          console.warn(`[steam] steam_link_failure code=${steamError.code}`);
          return redirectTo(request, errorPath(callbackReason(steamError.code)));
        }
      },
    },
  },
});

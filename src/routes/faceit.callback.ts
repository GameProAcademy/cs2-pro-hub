/**
 * PM5 — FACEIT OAuth callback at the redirect URI registered in the FACEIT App Studio
 * (`https://gamepro.network/faceit/callback`) (server-side only). Public route on purpose: FACEIT
 * redirects the browser here; see `handleFaceitCallback` for the security model.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/faceit/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleFaceitCallback } = await import("@/lib/faceit/faceit.callback.server");
        return handleFaceitCallback(request);
      },
    },
  },
});

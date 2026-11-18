/**
 * FASE 2.2.1 — FACEIT OAuth callback (server-side only). Public route on purpose: FACEIT
 * redirects the browser here; see `handleFaceitCallback` for the security model.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/integrations/faceit/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleFaceitCallback } = await import("@/lib/faceit/faceit.callback.server");
        return handleFaceitCallback(request);
      },
    },
  },
});

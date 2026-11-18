/**
 * PM5 — "Continue with FACEIT": starts a FACEIT sign-in (server-side only). Public on purpose;
 * see `handleFaceitLoginStart` for the browser binding, PKCE state and abuse ceiling.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/faceit/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleFaceitLoginStart } = await import("@/lib/faceit/faceit.login.server");
        return handleFaceitLoginStart(request);
      },
    },
  },
});

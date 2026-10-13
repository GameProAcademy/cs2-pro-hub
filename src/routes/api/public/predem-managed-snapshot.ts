import { createFileRoute } from "@tanstack/react-router";

import { isAttestationTransportAuthorized } from "@/lib/parserAttestationCrypto.server";

/**
 * H.3-E pre-DEM managed-database snapshot, for the activation gate only.
 *
 * Authenticated with the existing CI transport secret (constant-time compare),
 * read-only and uncached: it calls `public.h3e_predem_managed_snapshot()`
 * (STABLE, SECURITY DEFINER, service_role only), which returns aggregates and
 * identity fields only, plus a digest computed in the database. The document is
 * returned unchanged so the gate can check that digest; nothing here decides a
 * gate, and no response ever authorizes execution.
 */
export async function handlePredemManagedSnapshot(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const transportSecret = process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"];
  if (!transportSecret || transportSecret.length < 32) {
    return Response.json({ error: "SNAPSHOT_SERVER_NOT_CONFIGURED" }, { status: 503, headers });
  }
  if (!isAttestationTransportAuthorized(request.headers, transportSecret)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("h3e_predem_managed_snapshot" as never);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      return Response.json({ error: "SNAPSHOT_UNAVAILABLE" }, { status: 503, headers });
    }
    const digest = (data as Record<string, unknown>)["digest"];
    // Audit line: which snapshot was served, never its content or any secret.
    console.info("[predem-managed-snapshot] served", { digest });
    return Response.json({ snapshot: data }, { status: 200, headers });
  } catch {
    return Response.json({ error: "SNAPSHOT_UNAVAILABLE" }, { status: 503, headers });
  }
}

export const Route = createFileRoute("/api/public/predem-managed-snapshot")({
  server: {
    handlers: {
      GET: ({ request }) => handlePredemManagedSnapshot(request),
    },
  },
});

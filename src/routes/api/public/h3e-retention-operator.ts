import { createFileRoute } from "@tanstack/react-router";

import { isAttestationTransportAuthorized } from "@/lib/parserAttestationCrypto.server";

const ACTIONS = new Set(["inspect", "delete_mismatched_job_object", "delete_orphan_object"]);

/**
 * H.3-E retention operator, for the manual `h3e-retention-operator` workflow only.
 *
 * Authenticated with the CI transport secret (constant-time compare). It acts on
 * the two objects fixed in `h3eRetentionOperator.server.ts` and nothing else,
 * through the official Storage API; deletion is refused unless the official
 * reference fixture is proven present and intact. Responses carry outcome codes
 * and booleans only: no path, URL, payload or secret.
 */
export async function handleH3ERetentionOperator(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const transportSecret = process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"];
  if (!transportSecret || transportSecret.length < 32) {
    return Response.json({ error: "OPERATOR_NOT_CONFIGURED" }, { status: 503, headers });
  }
  if (!isAttestationTransportAuthorized(request.headers, transportSecret)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown } | null)?.action;
  } catch {
    action = undefined;
  }
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    return Response.json({ error: "ACTION_INVALID" }, { status: 400, headers });
  }
  try {
    const { runRetentionAction } = await import("@/lib/pipeline/h3eRetentionOperator.server");
    const result = await runRetentionAction(action as Parameters<typeof runRetentionAction>[0]);
    console.info("[h3e-retention-operator]", { action, outcome: result["outcome"] ?? "INSPECTED" });
    return Response.json(result, { status: 200, headers });
  } catch {
    return Response.json({ error: "OPERATOR_UNAVAILABLE" }, { status: 503, headers });
  }
}

export const Route = createFileRoute("/api/public/h3e-retention-operator")({
  server: {
    handlers: {
      POST: ({ request }) => handleH3ERetentionOperator(request),
    },
  },
});

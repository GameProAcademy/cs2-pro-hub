import { createFileRoute } from "@tanstack/react-router";

import { h3e91ExternalEvidenceSchema } from "@/lib/h3e91LiveEvidence";

export const Route = createFileRoute("/api/internal/h3e9/preflight")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer "))
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        const token = authorization.slice("Bearer ".length);
        let claims: Record<string, unknown>;
        try {
          const { verifyH3E91OidcToken } = await import("@/lib/h3e91Oidc.server");
          claims = await verifyH3E91OidcToken(token);
        } catch {
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        }
        const parsed = h3e91ExternalEvidenceSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success)
          return Response.json({ error: "H3E91_EVIDENCE_INVALID" }, { status: 400 });
        if (
          claims["repository"] !== parsed.data.workflowIdentity.repository ||
          claims["ref"] !== parsed.data.workflowIdentity.ref ||
          claims["event_name"] !== parsed.data.workflowIdentity.eventName ||
          claims["workflow"] !== parsed.data.workflowIdentity.workflow ||
          claims["workflow_ref"] !== parsed.data.workflowIdentity.workflowRef ||
          claims["workflow_sha"] !== parsed.data.workflowIdentity.sourceCommit
        ) {
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        }
        const { buildH3E91Artifact } = await import("@/lib/h3e91Collector.server");
        return Response.json(await buildH3E91Artifact(parsed.data), {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isAttestationTransportAuthorized } from "@/lib/parserAttestationCrypto.server";

/**
 * Read-only: why the RAW audit of one job is BLOCKED, for the manual operator workflow.
 *
 * Authenticated with the CI transport secret. It reads the job's sealed RAW manifest,
 * checks its audit-evidence digest and identity against the artifact row, and returns
 * reason codes, non-passing gate names, mapping-status counts, and non-sensitive parser
 * identity metadata. No demo content, path, URL or secret is returned; nothing is written.
 */
const body = z.object({ jobId: z.string().uuid() });

export async function handleH3ERawAuditReasons(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const transportSecret = process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"];
  if (!transportSecret || transportSecret.length < 32) {
    return Response.json({ error: "NOT_CONFIGURED" }, { status: 503, headers });
  }
  if (!isAttestationTransportAuthorized(request.headers, transportSecret)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  let jobId: string;
  try {
    jobId = body.parse(await request.json()).jobId;
  } catch {
    return Response.json({ error: "INPUT_INVALID" }, { status: 400, headers });
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: artifact, error } = await supabaseAdmin
      .from("raw_evidence_artifacts")
      .select(
        "job_id, upload_id, attempt_number, demo_sha256, root_digest, manifest_storage_path, status, audit_status",
      )
      .eq("job_id", jobId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return Response.json({ error: "LOOKUP_FAILED" }, { status: 503, headers });
    if (!artifact) return Response.json({ error: "NO_RAW_ARTIFACT" }, { status: 404, headers });
    if (artifact.status !== "ready") {
      return Response.json(
        { artifactStatus: artifact.status, auditStatus: artifact.audit_status },
        { headers },
      );
    }
    const { data: blob, error: blobError } = await supabaseAdmin.storage
      .from("cs2-raw-evidence")
      .download(artifact.manifest_storage_path);
    if (blobError || !blob)
      return Response.json({ error: "MANIFEST_UNAVAILABLE" }, { status: 503, headers });
    const manifest = JSON.parse(await blob.text()) as Record<string, unknown>;
    const { rawArtifactSha256, stableRawArtifactJson } =
      await import("@/lib/pipeline/rawArtifactContract");
    const evidence = manifest["audit_evidence"] as Record<string, unknown> | undefined;
    const sealed =
      !!evidence &&
      typeof evidence === "object" &&
      rawArtifactSha256(stableRawArtifactJson(evidence)) === manifest["audit_evidence_digest"] &&
      manifest["job_id"] === artifact.job_id &&
      manifest["root_digest"] === artifact.root_digest;
    if (!sealed) return Response.json({ error: "MANIFEST_NOT_SEALED" }, { status: 409, headers });
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    const records = (value: unknown) =>
      Array.isArray(value)
        ? value.filter(
            (v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v),
          )
        : [];
    const mappingStatusCounts: Record<string, number> = {};
    for (const item of records(evidence["field_mappings"])) {
      const status = typeof item["status"] === "string" ? item["status"] : "UNKNOWN";
      mappingStatusCounts[status] = (mappingStatusCounts[status] ?? 0) + 1;
    }
    const evidenceManifest =
      evidence["manifest"] &&
      typeof evidence["manifest"] === "object" &&
      !Array.isArray(evidence["manifest"])
        ? (evidence["manifest"] as Record<string, unknown>)
        : {};
    const parserIdentity = {
      name:
        typeof evidenceManifest["parser_name"] === "string"
          ? evidenceManifest["parser_name"]
          : null,
      version:
        typeof evidenceManifest["parser_version"] === "string"
          ? evidenceManifest["parser_version"]
          : null,
      revision:
        typeof evidenceManifest["parser_revision"] === "string"
          ? evidenceManifest["parser_revision"]
          : null,
      contractVersion:
        typeof evidenceManifest["contract_version"] === "number"
          ? evidenceManifest["contract_version"]
          : null,
      demoSha256:
        typeof evidenceManifest["demo_sha256"] === "string"
          ? evidenceManifest["demo_sha256"]
          : null,
      fileSize:
        typeof evidenceManifest["file_size"] === "number" ? evidenceManifest["file_size"] : null,
      auditSurfaceVersion:
        typeof evidence["audit_surface_version"] === "number"
          ? evidence["audit_surface_version"]
          : null,
      evidenceVersion:
        typeof evidence["evidence_version"] === "number" ? evidence["evidence_version"] : null,
      auditEvidenceDigest:
        typeof manifest["audit_evidence_digest"] === "string"
          ? manifest["audit_evidence_digest"]
          : null,
    };
    return Response.json(
      {
        jobId,
        attemptNumber: artifact.attempt_number,
        auditStatus: artifact.audit_status,
        rawStatus: evidence["raw_status"] ?? null,
        parserIdentity,
        reasons: strings(evidence["raw_block_reasons"]),
        failingGates: records(evidence["gates"])
          .filter((gate) => gate["status"] !== "PASS")
          .map((gate) => String(gate["gate"])),
        mappingStatusCounts,
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
  }
}

export const Route = createFileRoute("/api/public/h3e-raw-audit-reasons")({
  server: { handlers: { POST: ({ request }) => handleH3ERawAuditReasons(request) } },
});

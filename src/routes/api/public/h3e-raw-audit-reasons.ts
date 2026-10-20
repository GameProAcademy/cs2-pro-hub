import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isAttestationTransportAuthorized } from "@/lib/parserAttestationCrypto.server";
import { validateRawForensicContractV2 } from "@/lib/pipeline/rawArtifactContract";

/**
 * Read-only: why the RAW audit of one job is BLOCKED, for the manual operator workflow.
 *
 * Authenticated with the CI transport secret. It reads the job's sealed RAW manifest,
 * checks its audit-evidence digest and identity against the artifact row, and returns
 * reason codes, non-passing gate names, mapping-status counts, non-sensitive parser
 * identity metadata and round-boundary diagnostics (round numbers, boundary and
 * lifecycle-event ticks, side codes, field names). No player, demo content, path, URL or
 * secret is returned; nothing is written.
 */
const body = z.object({ jobId: z.string().uuid() });

/** Small RAW sections only (rounds, events); every object is size- and digest-checked. */
async function readRoundDiagnostics(
  db: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  artifactId: string,
): Promise<Record<string, unknown> | null> {
  if (!artifactId) return null;
  const { rawArtifactBytesSha256 } = await import("@/lib/pipeline/rawArtifactContract");
  const { decodeGzipJsonLines, summarizeRoundDiagnostics } =
    await import("@/lib/pipeline/rawRoundDiagnostics");
  const { data: chunks, error } = await db
    .from("raw_evidence_chunks")
    .select("section, chunk_index, storage_path, sha256, byte_size, status")
    .eq("artifact_id", artifactId)
    .in("section", ["rounds", "events"])
    .order("chunk_index");
  if (error || !Array.isArray(chunks)) return null;
  const rows: Record<"rounds" | "events", Array<Record<string, unknown>>> = {
    rounds: [],
    events: [],
  };
  const totalBytes = chunks.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0);
  if (chunks.length > 32 || totalBytes > 16 * 1024 * 1024)
    return { error: "ROUND_SECTIONS_TOO_LARGE", chunks: chunks.length };
  for (const chunk of chunks) {
    if (chunk.status !== "verified") return { error: "ROUND_SECTIONS_NOT_VERIFIED" };
    const { data, error: downloadError } = await db.storage
      .from("cs2-raw-evidence")
      .download(chunk.storage_path);
    if (downloadError || !data) return { error: "ROUND_SECTIONS_UNAVAILABLE" };
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength !== chunk.byte_size || rawArtifactBytesSha256(bytes) !== chunk.sha256)
      return { error: "ROUND_SECTIONS_DIGEST_MISMATCH" };
    rows[chunk.section as "rounds" | "events"].push(...(await decodeGzipJsonLines(bytes)));
  }
  return summarizeRoundDiagnostics(rows.rounds, rows.events);
}

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
        "id, job_id, upload_id, attempt_number, demo_sha256, root_digest, manifest_storage_path, status, audit_status",
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
    const forensicV2 =
      evidence["forensic_contract_v2"] && typeof evidence["forensic_contract_v2"] === "object"
        ? (evidence["forensic_contract_v2"] as Record<string, unknown>)
        : null;
    // Diagnostics never change the verdict-reporting contract above: a failure is reported.
    const roundDiagnostics = await readRoundDiagnostics(
      supabaseAdmin,
      String(artifact.id ?? ""),
    ).catch(() => ({ error: "ROUND_DIAGNOSTICS_UNAVAILABLE" }));
    return Response.json(
      {
        jobId,
        attemptNumber: artifact.attempt_number,
        roundDiagnostics,
        auditStatus: artifact.audit_status,
        rawStatus: evidence["raw_status"] ?? null,
        parserIdentity,
        reasons: strings(evidence["raw_block_reasons"]),
        failingGates: records(evidence["gates"])
          .filter((gate) => gate["status"] !== "PASS")
          .map((gate) => String(gate["gate"])),
        mappingStatusCounts,
        // The app-side admission check (forensic contract v2, producer stage) and the
        // worker's own v2 gate verdicts: gate names and reason codes only.
        forensicV2: {
          producerGateStatus:
            typeof forensicV2?.["producer_gate_status"] === "string"
              ? forensicV2["producer_gate_status"]
              : null,
          blockedGates: records(forensicV2?.["gates"])
            .filter((gate) => gate["status"] !== "PASS")
            .map((gate) => ({ gate: String(gate["gate"]), reasons: strings(gate["reasons"]) })),
          appProducerReasons: validateRawForensicContractV2(forensicV2, "producer"),
        },
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

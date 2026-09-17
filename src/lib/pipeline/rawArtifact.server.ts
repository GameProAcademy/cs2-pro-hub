import { PipelineError } from "@/lib/pipeline/errors";
import {
  RAW_ARTIFACT_SECTION_ORDER,
  rawArtifactSha256,
  stableRawArtifactJson,
} from "@/lib/pipeline/rawArtifactContract";
import {
  DURABLE_HOT_HARD_MAX_BYTES,
  type HotDemoPayloadV1,
  type RawArtifactReferenceV1,
  type RawParserOutput,
} from "@/lib/pipeline/types";
import type { RawAdmissionApproval, RawAdmissionDecision } from "@/lib/pipeline/rawEvidence";
import { expectedParserContract } from "@/lib/pipeline/parser/adapter";
import { assertParserIdentity } from "@/lib/pipeline/parser/parserEndpoint";

const RAW_BUCKET = "cs2-raw-evidence";
const HEX_64 = /^[0-9a-f]{64}$/;
const HOT_SECTIONS = ["players", "rounds", "combat_events", "utility_events", "objective_events",
  "aim_observations", "position_snapshots", "economy_snapshots", "warnings"] as const;
const OPTIONAL_SEMANTIC_HOT_SECTIONS = new Set(["aim_observations", "position_snapshots", "economy_snapshots"]);

export function assertHotDemoPayload(value: unknown): HotDemoPayloadV1 {
  if (!value || typeof value !== "object") throw new PipelineError("PARSER_INVALID_RESPONSE", "missing HOT payload");
  const hot = value as Partial<HotDemoPayloadV1>;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > DURABLE_HOT_HARD_MAX_BYTES) {
    throw new PipelineError("PARSER_PAYLOAD_TOO_LARGE", "HOT payload exceeds 8 MiB");
  }
  if (hot.schema_version !== 1 || hot.contract_version !== 1 || !hot.parser || !hot.demo || !hot.header) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid HOT identity");
  }
  const revision = typeof hot.parser.revision === "string" && hot.parser.revision.trim() ? hot.parser.revision.trim() : null;
  if (typeof hot.parser.name !== "string" || !hot.parser.name.trim() ||
      typeof hot.parser.version !== "string" || !hot.parser.version.trim()) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing HOT parser identity");
  }
  assertParserIdentity({
    name: hot.parser.name,
    version: hot.parser.version,
    revision,
    semanticRevision: hot.parser.semantic_revision?.trim() || revision,
    buildRevision: hot.parser.build_revision?.trim() || null,
    contractVersion: hot.contract_version,
  }, expectedParserContract());
  if (HOT_SECTIONS.some((key) => !Array.isArray(hot[key]))) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid HOT sections");
  }
  const forbidden = ["raw_evidence", "raw_events", "grenade_samples", "tick_samples",
    "raw_player_info", "field_mappings", "forensic_inventory"];
  if (forbidden.some((key) => key in (hot as Record<string, unknown>))) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW content is forbidden in HOT payload");
  }
  if (!hot.quality || !Array.isArray(hot.quality.limited_sections)) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "missing HOT quality");
  }
  const unclassified = hot.quality.unclassified_event_rows;
  if (!Number.isInteger(unclassified) || unclassified < 0) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid HOT unclassified event count");
  }
  for (const name of HOT_SECTIONS) {
    const quality = hot.quality.sections?.[name];
    const rows = hot[name];
    if (!quality || !rows || !Number.isInteger(quality.observed_rows) || !Number.isInteger(quality.included_rows) ||
        !Number.isInteger(quality.limit) || !Number.isInteger(quality.overflow_rows) ||
        quality.observed_rows < 0 || quality.included_rows < 0 || quality.limit < 0 || quality.overflow_rows < 0 ||
        quality.included_rows !== rows.length || quality.included_rows > quality.limit ||
        quality.observed_rows - quality.included_rows !== quality.overflow_rows) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", `invalid HOT bound: ${name}`);
    }
    if (quality.status === "not_implemented" || quality.status === "unavailable") {
      if (!OPTIONAL_SEMANTIC_HOT_SECTIONS.has(name) || quality.observed_rows !== 0 || quality.included_rows !== 0) {
        throw new PipelineError("PARSER_INVALID_RESPONSE", `invalid HOT implementation status: ${name}`);
      }
    } else if ((quality.overflow_rows > 0) !== (quality.status === "limited")) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", `silent HOT overflow: ${name}`);
    }
  }
  const expectedLimited = HOT_SECTIONS.filter((name) => hot.quality?.sections?.[name]?.status === "limited").sort();
  const declaredLimited = [...hot.quality.limited_sections].sort();
  if (stableRawArtifactJson(expectedLimited) !== stableRawArtifactJson(declaredLimited) ||
      hot.quality.partial !== (unclassified > 0 || expectedLimited.length > 0 ||
        HOT_SECTIONS.some((name) => ["not_implemented", "unavailable"].includes(
          hot.quality?.sections?.[name]?.status ?? "")))) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "inconsistent HOT quality summary");
  }
  return hot as HotDemoPayloadV1;
}

export function assertRawArtifactReference(value: unknown): RawArtifactReferenceV1 {
  if (!value || typeof value !== "object") throw new PipelineError("PARSER_INVALID_RESPONSE", "missing RAW artifact reference");
  const raw = value as Partial<RawArtifactReferenceV1>;
  if (raw.schema_version !== 1 || raw.status !== "ready" || raw.raw_status !== "ready" ||
      raw.bucket !== RAW_BUCKET || !raw.artifact_id || !raw.manifest_storage_path ||
      !raw.root_digest || !HEX_64.test(raw.root_digest) || !raw.job_id || !raw.upload_id ||
      !raw.user_id || !Number.isInteger(raw.attempt_number) || Number(raw.attempt_number) < 1 ||
      !raw.demo_sha256 || !HEX_64.test(raw.demo_sha256) || !raw.parser ||
      raw.contract_version !== 1 || !Number.isInteger(raw.total_chunks) || Number(raw.total_chunks) < 1 ||
      !Number.isInteger(raw.total_rows) || Number(raw.total_rows) < 0 ||
      !Number.isInteger(raw.total_bytes) || Number(raw.total_bytes) <= 0) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW artifact reference");
  }
  return raw as RawArtifactReferenceV1;
}

export function hotToRawParserOutput(hot: HotDemoPayloadV1): RawParserOutput {
  return {
    parser: hot.parser,
    contract_version: hot.contract_version,
    header: hot.header,
    players: hot.players,
    rounds: hot.rounds,
    events: [...hot.combat_events, ...hot.utility_events, ...hot.objective_events],
    warnings: hot.warnings,
    hot_semantic_data: {
      schema_version: 1,
      aim_observations: hot.aim_observations,
      position_snapshots: hot.position_snapshots,
      economy_snapshots: hot.economy_snapshots,
      quality: {
        aim_observations: hot.quality.sections["aim_observations"],
        position_snapshots: hot.quality.sections["position_snapshots"],
        economy_snapshots: hot.quality.sections["economy_snapshots"],
      },
    },
  };
}

export async function verifyRawArtifact(args: {
  ref: RawArtifactReferenceV1;
  hot: HotDemoPayloadV1;
  jobId: string;
  uploadId: string;
  userId: string;
  attemptNumber: number;
  expectedSha256: string | null;
}): Promise<RawAdmissionDecision> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: artifact, error } = await supabaseAdmin.from("raw_evidence_artifacts")
    .select("*").eq("id", args.ref.artifact_id).maybeSingle();
  if (error || !artifact) throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact not found");
  const expectedPrefix = `${args.userId}/${args.uploadId}/attempt-${args.attemptNumber}`;
  const identityMatches = artifact.job_id === args.jobId && artifact.upload_id === args.uploadId &&
    artifact.user_id === args.userId && artifact.attempt_number === args.attemptNumber &&
    artifact.demo_sha256 === args.expectedSha256?.toLowerCase() &&
    args.ref.job_id === args.jobId && args.ref.upload_id === args.uploadId &&
    args.ref.user_id === args.userId && args.ref.attempt_number === args.attemptNumber &&
    args.ref.demo_sha256 === args.expectedSha256?.toLowerCase() &&
    args.hot.demo.sha256 === args.expectedSha256?.toLowerCase() && args.hot.demo.upload_id === args.uploadId &&
    artifact.storage_bucket === RAW_BUCKET && artifact.storage_prefix === expectedPrefix &&
    artifact.manifest_storage_path === `${expectedPrefix}/manifest.json`;
  if (!identityMatches) throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact identity mismatch");
  if (artifact.status !== "ready" || artifact.raw_status !== "ready" || !artifact.ready_at ||
      artifact.root_digest !== args.ref.root_digest) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW artifact is not ready");
  }
  if (artifact.audit_status !== "approved") {
    return { status: "BLOCKED", auditStatus: "BLOCKED", approved: false, auditVersion: 3,
      reasons: [`raw_artifact_audit:${artifact.audit_status}`], evidenceDigest: args.ref.root_digest,
      forensicInventory: {} };
  }
  if (args.ref.audit_status !== artifact.audit_status || args.ref.parser.name !== args.hot.parser.name ||
      args.ref.parser.version !== args.hot.parser.version ||
      (args.ref.parser.revision ?? null) !== (args.hot.parser.revision ?? null) ||
      (args.ref.parser.semantic_revision ?? args.ref.parser.revision ?? null) !==
        (args.hot.parser.semantic_revision ?? args.hot.parser.revision ?? null) ||
      (args.ref.parser.build_revision ?? null) !== (args.hot.parser.build_revision ?? null) ||
      args.ref.contract_version !== args.hot.contract_version ||
      args.ref.total_chunks !== artifact.total_chunks || args.ref.total_rows !== artifact.total_rows ||
      args.ref.total_bytes !== artifact.total_bytes) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW reference mismatch");
  }
  const { data: chunks, error: chunksError } = await supabaseAdmin.from("raw_evidence_chunks")
    .select("section, chunk_index, row_count, byte_size, sha256, previous_chunk_sha256, status, storage_path")
    .eq("artifact_id", artifact.id).order("section").order("chunk_index");
  if (chunksError || !chunks || chunks.length !== artifact.total_chunks || chunks.some((chunk) => chunk.status !== "verified")) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunks are not verified");
  }
  let previous: string | null = null;
  for (const section of RAW_ARTIFACT_SECTION_ORDER) {
    const own = chunks.filter((chunk) => chunk.section === section).sort((a, b) => a.chunk_index - b.chunk_index);
    for (const [index, chunk] of own.entries()) {
      if (chunk.chunk_index !== index || chunk.previous_chunk_sha256 !== previous || !HEX_64.test(chunk.sha256)) {
        throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunk chain mismatch");
      }
      previous = chunk.sha256;
    }
  }
  const summaries = RAW_ARTIFACT_SECTION_ORDER.map((section) => {
    const own = chunks.filter((chunk) => chunk.section === section).sort((a, b) => a.chunk_index - b.chunk_index);
    return { name: section, chunk_count: own.length,
      row_count: own.reduce((sum, chunk) => sum + Number(chunk.row_count), 0),
      byte_count: own.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0),
      digest: rawArtifactSha256(stableRawArtifactJson(own.map((chunk) => chunk.sha256))) };
  });
  if (rawArtifactSha256(stableRawArtifactJson(summaries)) !== artifact.root_digest) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW root digest mismatch");
  }
  const { data: manifestBlob, error: manifestError } = await supabaseAdmin.storage
    .from(RAW_BUCKET).download(artifact.manifest_storage_path);
  if (manifestError || !manifestBlob) throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW manifest unavailable");
  const manifest = JSON.parse(await manifestBlob.text()) as Record<string, unknown>;
  const auditEvidence = manifest["audit_evidence"];
  const auditEvidenceDigest = manifest["audit_evidence_digest"];
  const auditEvidenceValid = auditEvidence != null && typeof auditEvidence === "object" &&
    !Array.isArray(auditEvidence) && typeof auditEvidenceDigest === "string" &&
    rawArtifactSha256(stableRawArtifactJson(auditEvidence)) === auditEvidenceDigest;
  const manifestMatches = manifest["schema_version"] === 1 && manifest["job_id"] === args.jobId &&
    manifest["upload_id"] === args.uploadId && manifest["attempt_number"] === args.attemptNumber &&
    manifest["demo_sha256"] === args.expectedSha256?.toLowerCase() &&
    manifest["contract_version"] === args.hot.contract_version &&
    stableRawArtifactJson(manifest["parser"]) === stableRawArtifactJson(args.hot.parser) &&
    stableRawArtifactJson(manifest["sections"]) === stableRawArtifactJson(summaries) &&
    manifest["root_digest"] === artifact.root_digest && manifest["status"] === "ready" &&
    manifest["raw_status"] === "ready" && manifest["audit_status"] === artifact.audit_status &&
    derivePersistedAuditStatus(manifest) === artifact.audit_status && auditEvidenceValid;
  if (!manifestMatches) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW manifest mismatch");
  }
  return { status: "PASS", auditStatus: "APPROVED", approved: true, auditVersion: 3,
    reasons: [], evidenceDigest: artifact.root_digest,
    forensicInventory: { artifact_id: artifact.id, manifest_storage_path: artifact.manifest_storage_path,
      total_chunks: artifact.total_chunks, total_rows: artifact.total_rows, total_bytes: artifact.total_bytes } };
}

function derivePersistedAuditStatus(manifest: Record<string, unknown>): "approved" | "blocked" {
  const evidence = manifest["audit_evidence"];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "blocked";
  const item = evidence as Record<string, unknown>;
  const reasons = item["raw_block_reasons"];
  const gates = item["gates"];
  const mappings = item["field_mappings"];
  if (item["raw_status"] !== "PASS" || item["raw_audit_status"] !== "APPROVED" ||
      !Array.isArray(reasons) || reasons.length || !Array.isArray(gates) || !gates.length ||
      !Array.isArray(mappings) || !mappings.length) return "blocked";
  const gatesPass = gates.every((gate) => gate && typeof gate === "object" &&
    (gate as Record<string, unknown>)["status"] === "PASS");
  const mappingsPass = mappings.every((mapping) => {
    if (!mapping || typeof mapping !== "object") return false;
    const value = mapping as Record<string, unknown>;
    const status = value["status"];
    if (status === "PARSE_FAILED") return false;
    if (status === "UNMAPPED_BUT_AVAILABLE" || status === "RAW_ONLY_INTENTIONAL") {
      return value["reason_present"] === true;
    }
    return true;
  });
  return gatesPass && mappingsPass ? "approved" : "blocked";
}

export function rawArtifactApproval(decision: RawAdmissionDecision, artifactId: string): RawAdmissionApproval {
  if (!decision.approved || decision.auditStatus !== "APPROVED" || decision.status !== "PASS") {
    throw new PipelineError("RAW_AUDIT_BLOCKED", decision.reasons.join(",") || "RAW artifact admission denied");
  }
  return { approved: true, auditStatus: "APPROVED", auditVersion: decision.auditVersion,
    evidenceDigest: decision.evidenceDigest, artifactId };
}
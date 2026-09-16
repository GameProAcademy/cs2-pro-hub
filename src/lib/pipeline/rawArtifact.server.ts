import { createHash } from "node:crypto";

import { PipelineError } from "@/lib/pipeline/errors";
import type {
  HotDemoPayloadV1,
  RawArtifactReferenceV1,
  RawParserOutput,
} from "@/lib/pipeline/types";
import type { RawAdmissionApproval, RawAdmissionDecision } from "@/lib/pipeline/rawEvidence";

const RAW_BUCKET = "cs2-raw-evidence";
const HEX_64 = /^[0-9a-f]{64}$/;
const SECTION_ORDER = [
  "header", "players", "rounds", "events", "ticks", "grenades", "player-info",
  "game-state", "economy", "forensic",
] as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertHotDemoPayload(value: unknown): HotDemoPayloadV1 {
  if (!value || typeof value !== "object") throw new PipelineError("PARSER_INVALID_RESPONSE", "missing HOT payload");
  const hot = value as Partial<HotDemoPayloadV1>;
  if (hot.schema_version !== 1 || hot.contract_version !== 1 || !hot.parser || !hot.demo || !hot.header) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid HOT identity");
  }
  const sections = ["players", "rounds", "combat_events", "utility_events", "objective_events",
    "aim_observations", "position_snapshots", "economy_snapshots", "warnings"] as const;
  if (sections.some((key) => !Array.isArray(hot[key]))) {
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
  for (const [name, quality] of Object.entries(hot.quality.sections ?? {})) {
    if (quality.included_rows > quality.limit || quality.observed_rows - quality.included_rows !== quality.overflow_rows) {
      throw new PipelineError("PARSER_INVALID_RESPONSE", `invalid HOT bound: ${name}`);
    }
    if (quality.overflow_rows > 0 && quality.status !== "limited") {
      throw new PipelineError("PARSER_INVALID_RESPONSE", `silent HOT overflow: ${name}`);
    }
  }
  return hot as HotDemoPayloadV1;
}

export function assertRawArtifactReference(value: unknown): RawArtifactReferenceV1 {
  if (!value || typeof value !== "object") throw new PipelineError("PARSER_INVALID_RESPONSE", "missing RAW artifact reference");
  const raw = value as Partial<RawArtifactReferenceV1>;
  if (raw.schema_version !== 1 || raw.status !== "ready" || raw.raw_status !== "ready" ||
      raw.bucket !== RAW_BUCKET || !raw.artifact_id || !raw.manifest_storage_path ||
      !raw.root_digest || !HEX_64.test(raw.root_digest)) {
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
    events: [...hot.combat_events, ...hot.utility_events, ...hot.objective_events,
      ...hot.aim_observations, ...hot.position_snapshots, ...hot.economy_snapshots],
    warnings: hot.warnings,
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
  const { data: chunks, error: chunksError } = await supabaseAdmin.from("raw_evidence_chunks")
    .select("section, chunk_index, row_count, byte_size, sha256, previous_chunk_sha256, status, storage_path")
    .eq("artifact_id", artifact.id).order("section").order("chunk_index");
  if (chunksError || !chunks || chunks.length !== artifact.total_chunks || chunks.some((chunk) => chunk.status !== "verified")) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunks are not verified");
  }
  let previous: string | null = null;
  for (const section of SECTION_ORDER) {
    const own = chunks.filter((chunk) => chunk.section === section).sort((a, b) => a.chunk_index - b.chunk_index);
    for (const [index, chunk] of own.entries()) {
      if (chunk.chunk_index !== index || chunk.previous_chunk_sha256 !== previous || !HEX_64.test(chunk.sha256)) {
        throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunk chain mismatch");
      }
      previous = chunk.sha256;
    }
  }
  const summaries = SECTION_ORDER.map((section) => {
    const own = chunks.filter((chunk) => chunk.section === section).sort((a, b) => a.chunk_index - b.chunk_index);
    return { name: section, chunk_count: own.length,
      row_count: own.reduce((sum, chunk) => sum + Number(chunk.row_count), 0),
      byte_count: own.reduce((sum, chunk) => sum + Number(chunk.byte_size), 0),
      digest: sha256(stable(own.map((chunk) => chunk.sha256))) };
  });
  if (sha256(stable(summaries)) !== artifact.root_digest) {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW root digest mismatch");
  }
  const { data: manifestBlob, error: manifestError } = await supabaseAdmin.storage
    .from(RAW_BUCKET).download(artifact.manifest_storage_path);
  if (manifestError || !manifestBlob) throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW manifest unavailable");
  const manifest = JSON.parse(await manifestBlob.text()) as Record<string, unknown>;
  if (manifest["root_digest"] !== artifact.root_digest || manifest["status"] !== "ready") {
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW manifest mismatch");
  }
  return { status: "PASS", auditStatus: "APPROVED", approved: true, auditVersion: 3,
    reasons: [], evidenceDigest: artifact.root_digest,
    forensicInventory: { artifact_id: artifact.id, manifest_storage_path: artifact.manifest_storage_path,
      total_chunks: artifact.total_chunks, total_rows: artifact.total_rows, total_bytes: artifact.total_bytes } };
}

export function rawArtifactApproval(decision: RawAdmissionDecision, artifactId: string): RawAdmissionApproval {
  return { approved: true, auditStatus: "APPROVED", auditVersion: decision.auditVersion,
    evidenceDigest: decision.evidenceDigest, artifactId };
}
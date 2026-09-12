import type { Json } from "@/integrations/supabase/types";

export const RAW_EVIDENCE_VERSION = 1;
export type RawEvidenceStatus = "PASS" | "FAIL" | "BLOCKED";
export type RawFieldMappingStatus =
  | "MAPPED" | "DERIVED" | "UNAVAILABLE" | "UNSUPPORTED"
  | "UNMAPPED_BUT_AVAILABLE" | "DROPPED_WITH_REASON";

export interface RawDemoEvidenceManifest {
  parser_name: string | null; parser_version: string | null; parser_revision: string | null;
  contract_version: number | null; demo_sha256: string | null; file_size: number | null;
  map: string | null; patch_version: string | null; build_number: string | number | null;
  demo_version_name: string | null; demo_version_guid: string | null; demo_file_stamp: string | null;
  server_name: string | null; client_name: string | null; game_directory: string | null;
  tickrate: number | null; playback_ticks: number | null; playback_time: number | null;
  playback_frames: number | null; players_count: number; rounds_count: number; events_count: number;
  first_tick: number | null; last_tick: number | null; warnings: string[];
  partial_parse: boolean; extraction_confidence: number | null;
}
export interface RawEventCoverage {
  event_name: string; available: boolean; parse_attempted: boolean; parse_success: boolean;
  row_count: number | null; first_tick: number | null; last_tick: number | null;
  first_round: number | null; last_round: number | null; fields_available: string[];
  fields_missing: string[]; error_type: string | null; error_message_safe: string | null;
}
export interface RawPropertyCoverage {
  property: string; available: boolean; rows: number; null_percent: number | null;
  min: number | null; max: number | null; sample: Json;
  first_tick?: number | null; last_tick?: number | null; success?: boolean; error?: string | null;
}
export interface RawDemoEvent {
  event_name: string; tick: number | null; round: number | null; time_seconds: number | null;
  raw_fields: Record<string, Json | undefined>; parser_source: string; source_index: number;
}
export interface RawFieldMapping {
  raw_field: string; app_field: string | null; canonical_field: string | null;
  status: RawFieldMappingStatus; reason: string | null;
}
export interface RawEvidenceGate { gate: string; status: RawEvidenceStatus; reasons: string[] }
export interface RawDemoEvidence {
  evidence_version: number; manifest: RawDemoEvidenceManifest; event_coverage: RawEventCoverage[];
  raw_events: RawDemoEvent[]; player_coverage: RawPropertyCoverage[];
  tick_coverage: RawPropertyCoverage[]; tick_samples: Record<string, Json | undefined>[];
  grenade_coverage: RawPropertyCoverage[]; grenade_samples: Record<string, Json | undefined>[];
  round_evidence: Record<string, Json | undefined>[]; economy_coverage: RawPropertyCoverage[];
  field_mappings: RawFieldMapping[]; gates: RawEvidenceGate[]; deterministic_digest: string;
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function assertRawDemoEvidence(value: unknown): RawDemoEvidence {
  if (!value || typeof value !== "object") throw new Error("missing raw evidence");
  const raw = value as Partial<RawDemoEvidence>;
  if (raw.evidence_version !== RAW_EVIDENCE_VERSION || !raw.manifest) throw new Error("invalid raw evidence version");
  const lists = [raw.event_coverage, raw.raw_events, raw.player_coverage, raw.tick_coverage,
    raw.tick_samples, raw.grenade_coverage, raw.grenade_samples, raw.round_evidence,
    raw.economy_coverage, raw.field_mappings, raw.gates];
  if (lists.some((item) => !Array.isArray(item))) throw new Error("invalid raw evidence sections");
  if (!/^[0-9a-f]{64}$/.test(raw.deterministic_digest ?? "")) throw new Error("invalid raw evidence digest");
  return raw as RawDemoEvidence;
}

export function evaluateRawEvidence(evidence: RawDemoEvidence): RawEvidenceGate[] {
  const gates = array(evidence.gates) as RawEvidenceGate[];
  return [...gates].sort((a, b) => a.gate.localeCompare(b.gate));
}

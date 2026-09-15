import type { Json } from "@/integrations/supabase/types";

export const RAW_EVIDENCE_VERSION = 1;
export const RAW_EVIDENCE_AUDIT_VERSION = 2;
export type RawEvidenceStatus = "PASS" | "FAIL" | "BLOCKED";
export type RawAuditStatus = "PENDING" | "BLOCKED" | "APPROVED";
export type RawCoverageStatus = "COMPLETE" | "LIMITED" | "SAMPLE";
export type RawFieldMappingStatus =
  | "MAPPED"
  | "DERIVED"
  | "RAW_ONLY_INTENTIONAL"
  | "NOT_PRESENT_IN_DEMO"
  | "UNAVAILABLE"
  | "PARSE_FAILED"
  | "UNMAPPED_BUT_AVAILABLE";
export type RawCapabilityState =
  | "NOT_PRESENT_IN_DEMO"
  | "AVAILABLE_BUT_EMPTY"
  | "PARSED_SUCCESSFULLY"
  | "PARSE_FAILED"
  | "API_UNAVAILABLE";

export interface RawDemoEvidenceManifest {
  parser_name: string | null;
  parser_version: string | null;
  parser_revision: string | null;
  contract_version: number | null;
  demo_sha256: string | null;
  file_size: number | null;
  map: string | null;
  patch_version: string | null;
  build_number: string | number | null;
  demo_version_name: string | null;
  demo_version_guid: string | null;
  demo_file_stamp: string | null;
  server_name: string | null;
  client_name: string | null;
  game_directory: string | null;
  tickrate: number | null;
  playback_ticks: number | null;
  playback_time: number | null;
  playback_frames: number | null;
  players_count: number;
  rounds_count: number;
  events_count: number;
  event_inventory_success: boolean;
  event_inventory_count: number;
  first_tick: number | null;
  last_tick: number | null;
  warnings: string[];
  partial_parse: boolean;
  extraction_confidence: number | null;
  event_inventory: string[];
  selected_event_candidates: string[];
  parsed_event_tables: string[];
  tick_sample_rows: number;
  event_rows: number;
  estimated_evidence_bytes: number | null;
  event_capability_coverage?: RawCoverageStatus;
  raw_header?: Record<string, Json | undefined>;
  tick_sampling?: {
    coverage: "SAMPLE";
    limit: number;
    strategy: string;
    truncated: boolean;
    sample_size?: number;
    first_sampled_tick?: number | null;
    last_sampled_tick?: number | null;
    total_demo_ticks?: number | null;
    full_extraction?: false;
  };
}
export interface RawEventCoverage {
  event_name: string;
  available: boolean;
  parse_attempted: boolean;
  parse_success: boolean;
  row_count: number | null;
  first_tick: number | null;
  last_tick: number | null;
  first_round: number | null;
  last_round: number | null;
  fields_available: string[];
  fields_missing: string[];
  error_type: string | null;
  error_message_safe: string | null;
  capability_state: RawCapabilityState;
}
export interface RawPropertyCoverage {
  property: string;
  available: boolean;
  rows: number;
  null_percent: number | null;
  min: number | null;
  max: number | null;
  sample: Json;
  first_tick?: number | null;
  last_tick?: number | null;
  success?: boolean;
  error?: string | null;
}
export interface RawDemoEvent {
  event_name: string;
  tick: number | null;
  round: number | null;
  time_seconds: number | null;
  raw_fields: Record<string, Json | undefined>;
  parser_source: string;
  source_index: number;
}
export interface RawFieldMapping {
  raw_field: string;
  app_field: string | null;
  canonical_field: string | null;
  status: RawFieldMappingStatus;
  reason: string | null;
}
export interface RawEvidenceGate {
  gate: string;
  status: RawEvidenceStatus;
  reasons: string[];
}
export interface RawDemoEvidence {
  evidence_version: number;
  manifest: RawDemoEvidenceManifest;
  event_coverage: RawEventCoverage[];
  raw_events: RawDemoEvent[];
  player_coverage: RawPropertyCoverage[];
  tick_coverage: RawPropertyCoverage[];
  tick_samples: Record<string, Json | undefined>[];
  grenade_coverage: RawPropertyCoverage[];
  grenade_samples: Record<string, Json | undefined>[];
  round_evidence: Record<string, Json | undefined>[];
  economy_coverage: RawPropertyCoverage[];
  field_mappings: RawFieldMapping[];
  gates: RawEvidenceGate[];
  deterministic_digest: string;
  forensic_inventory?: Record<string, Json>;
  raw_status?: RawEvidenceStatus;
  raw_block_reasons?: string[];
}

export interface RawAdmissionDecision {
  status: RawEvidenceStatus;
  auditStatus: RawAuditStatus;
  approved: boolean;
  auditVersion: number;
  reasons: string[];
  evidenceDigest: string;
  forensicInventory: Record<string, Json>;
}

export interface RawAdmissionApproval {
  approved: true;
  auditStatus: "APPROVED";
  auditVersion: number;
  evidenceDigest: string;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function assertRawDemoEvidence(value: unknown): RawDemoEvidence {
  if (!value || typeof value !== "object") throw new Error("missing raw evidence");
  const raw = value as Partial<RawDemoEvidence>;
  if (raw.evidence_version !== RAW_EVIDENCE_VERSION || !raw.manifest)
    throw new Error("invalid raw evidence version");
  const lists = [
    raw.event_coverage,
    raw.raw_events,
    raw.player_coverage,
    raw.tick_coverage,
    raw.tick_samples,
    raw.grenade_coverage,
    raw.grenade_samples,
    raw.round_evidence,
    raw.economy_coverage,
    raw.field_mappings,
    raw.gates,
  ];
  if (lists.some((item) => !Array.isArray(item))) throw new Error("invalid raw evidence sections");
  for (const mapping of raw.field_mappings ?? []) {
    if (!mapping?.raw_field || !mapping.status) throw new Error("invalid raw evidence mapping");
  }
  if (!/^[0-9a-f]{64}$/.test(raw.deterministic_digest ?? ""))
    throw new Error("invalid raw evidence digest");
  return raw as RawDemoEvidence;
}

export function evaluateRawEvidence(evidence: RawDemoEvidence): RawEvidenceGate[] {
  const gates = array(evidence.gates) as RawEvidenceGate[];
  return [...gates].sort((a, b) => a.gate.localeCompare(b.gate));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Server-side forensic admission decision. Unknown material is retained in RAW
 * and blocks Canonical; it is never discarded merely because mapping work is pending.
 */
export function runRawForensicAudit(evidence: RawDemoEvidence): RawAdmissionDecision {
  const reasons: string[] = [];
  let status: RawEvidenceStatus = "PASS";
  const requiredInventoryKeys = [
    "header_inventory", "player_info_inventory", "game_state_inventory",
    "round_inventory", "bomb_inventory", "damage_inventory", "death_inventory",
    "weapon_inventory", "grenade_inventory", "usercmd_inventory", "teams_inventory",
    "score_inventory", "aggregate_inventory", "movement_inventory", "all_event_inventory",
    "selected_event_extraction", "actually_parsed_events", "mapping_inventory", "tick_sampling",
  ];

  if (!evidence.manifest || !evidence.deterministic_digest) reasons.push("audit_manifest_missing");
  if (evidence.gates.length === 0) reasons.push("audit_gates_empty");
  if (evidence.field_mappings.length === 0) reasons.push("audit_mapping_inventory_empty");
  if (!evidence.forensic_inventory || typeof evidence.forensic_inventory !== "object") {
    reasons.push("audit_inventory_missing");
  } else {
    for (const key of requiredInventoryKeys) {
      if (!(key in evidence.forensic_inventory)) reasons.push(`audit_inventory_missing:${key}`);
    }
  }

  for (const mapping of evidence.field_mappings) {
    if (mapping.status === "PARSE_FAILED") {
      status = "FAIL";
      reasons.push(`parse_failed:${mapping.raw_field}`);
    } else if (mapping.status === "UNMAPPED_BUT_AVAILABLE") {
      if (status !== "FAIL") status = "BLOCKED";
      reasons.push(`unmapped_but_available:${mapping.raw_field}`);
    } else if (mapping.status === "RAW_ONLY_INTENTIONAL" && !mapping.reason?.trim()) {
      if (status !== "FAIL") status = "BLOCKED";
      reasons.push(`raw_only_reason_missing:${mapping.raw_field}`);
    }
  }

  for (const gate of evaluateRawEvidence(evidence)) {
    if (gate.status === "FAIL") {
      if (status !== "FAIL") status = "BLOCKED";
      reasons.push(`gate:${gate.gate}`);
    } else if (gate.status === "BLOCKED") {
      if (status !== "FAIL") status = "BLOCKED";
      reasons.push(`gate:${gate.gate}`);
    }
  }

  const manifest = evidence.manifest;
  if (!manifest.parser_name || !manifest.parser_version || !manifest.demo_sha256 || !manifest.contract_version) {
    reasons.push("audit_identity_incomplete");
  }
  if (manifest.event_inventory_count !== manifest.event_inventory.length) {
    reasons.push("event_inventory_count_mismatch");
  }
  const preservedEventFields = new Set(
    evidence.raw_events.flatMap((event) =>
      Object.keys(event.raw_fields).map((field) => `${event.event_name}.${field}`),
    ),
  );
  const mappedFields = new Set(evidence.field_mappings.map((mapping) => mapping.raw_field));
  for (const field of preservedEventFields) {
    if (!mappedFields.has(field)) reasons.push(`returned_field_not_in_mapping:${field}`);
  }
  for (const coverage of evidence.event_coverage) {
    for (const field of coverage.fields_available) {
      const qualified = `${coverage.event_name}.${field}`;
      if (!preservedEventFields.has(qualified)) reasons.push(`returned_field_not_preserved:${qualified}`);
    }
    if (coverage.capability_state === "PARSE_FAILED") reasons.push(`parse_failed:event:${coverage.event_name}`);
  }
  if (manifest.tick_sampling?.coverage !== "SAMPLE" || manifest.tick_sampling.full_extraction === true) {
    reasons.push("tick_coverage_mischaracterized");
  }
  if (reasons.length > 0 && status !== "FAIL") status = "BLOCKED";
  const forensicInventory: Record<string, Json> = {
    header_inventory: Object.keys(manifest.raw_header ?? {}).sort(),
    player_info_inventory: evidence.player_coverage.map((row) => row.property).sort(),
    game_state_inventory: evidence.tick_coverage.map((row) => row.property).sort(),
    round_inventory: evidence.round_evidence.flatMap((row) => Object.keys(row)).filter(Boolean).sort(),
    bomb_inventory: evidence.event_coverage.filter((row) => row.event_name.startsWith("bomb_")).map((row) => row.event_name).sort(),
    damage_inventory: evidence.event_coverage.filter((row) => row.event_name.includes("damage") || row.event_name === "player_hurt").map((row) => row.event_name).sort(),
    death_inventory: evidence.event_coverage.filter((row) => row.event_name === "player_death").map((row) => row.event_name),
    weapon_inventory: evidence.event_coverage.filter((row) => row.event_name.includes("weapon") || row.event_name.startsWith("item_")).map((row) => row.event_name).sort(),
    grenade_inventory: evidence.grenade_coverage.map((row) => row.property).sort(),
    usercmd_inventory: evidence.tick_coverage.filter((row) => ["buttons", "view_angles", "aim_punch_angle", "aim_punch_angle_vel", "shots_fired"].includes(row.property)).map((row) => row.property).sort(),
    teams_inventory: evidence.player_coverage.filter((row) => row.property.includes("team") || row.property === "team_num").map((row) => row.property).sort(),
    score_inventory: evidence.player_coverage.filter((row) => row.property === "score" || row.property.includes("score") || row.property.includes("rounds_total")).map((row) => row.property).sort(),
    aggregate_inventory: evidence.field_mappings.filter((row) => row.raw_field.includes("_total")).map((row) => row.raw_field).sort(),
    movement_inventory: evidence.tick_coverage.filter((row) => ["X", "Y", "Z", "velocity", "velocity_X", "velocity_Y", "velocity_Z", "yaw", "pitch"].includes(row.property)).map((row) => row.property).sort(),
    all_event_inventory: manifest.event_inventory,
    selected_event_extraction: manifest.selected_event_candidates,
    actually_parsed_events: manifest.parsed_event_tables,
    mapping_inventory: evidence.field_mappings as unknown as Json,
    tick_sampling: (manifest.tick_sampling ?? {
      coverage: "SAMPLE",
      limit: evidence.tick_samples.length,
      strategy: "event-boundary-stratified",
      truncated: false,
    }) as unknown as Json,
  };

  return {
    status,
    auditStatus: status === "PASS" ? "APPROVED" : "BLOCKED",
    approved: status === "PASS",
    auditVersion: RAW_EVIDENCE_AUDIT_VERSION,
    reasons: unique(reasons),
    evidenceDigest: evidence.deterministic_digest,
    forensicInventory,
  };
}

export function assertRawAdmissionApproved(
  decision: RawAdmissionDecision,
): asserts decision is RawAdmissionDecision & { approved: true; status: "PASS"; auditStatus: "APPROVED" } {
  if (!decision.approved || decision.status !== "PASS" || decision.auditStatus !== "APPROVED") {
    throw new Error(`RAW forensic admission denied: ${decision.reasons.join(",") || decision.status}`);
  }
}

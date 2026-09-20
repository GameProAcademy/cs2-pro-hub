import type { Json } from "@/integrations/supabase/types";

export const RAW_EVIDENCE_VERSION = 1;
export const RAW_EVIDENCE_AUDIT_VERSION = 2;
export const RAW_FORENSIC_CONTRACT_VERSION = 2;
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
  returned_fields?: string[];
  non_null_fields?: string[];
  null_only_fields?: string[];
  preserved_fields?: string[];
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
  raw_player_info: Record<string, Json | undefined>[];
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
  forensic_contract_v2?: RawForensicContractV2;
}

export interface RawForensicGateV2 {
  gate: string;
  status: RawEvidenceStatus;
  reasons: string[];
}

export interface RawForensicContractV2 {
  audit_contract_version: 2;
  parser: { name: string | null; version: string | null };
  capability_catalog: Record<string, Json>;
  capability_reconciliation: Record<string, Json>;
  full_tick_audit: Record<string, Json>;
  property_inventory: Array<Record<string, Json>>;
  event_inventory: Array<Record<string, Json>>;
  semantic_inventories: Record<string, Json>;
  mapping_inventory: RawFieldMapping[];
  gates: RawForensicGateV2[];
  producer_gate_status: "PASS" | "BLOCKED";
  physical_gate_status: "PENDING" | "PASS" | "FAIL";
  final_gate_status: "PASS" | "BLOCKED";
  physical_reaudit_required: true;
  canonical_admission: "BLOCKED" | "APPROVED";
  catalog_digest: string;
  tick_authority_digest: string;
  unsigned_contract_digest: string;
  artifact_root_digest?: string;
  reconciliation_digest?: string;
  reconciliation_dimensions?: Record<string, "PASS" | "FAIL">;
  final_contract_digest?: string;
  deterministic_digest: string;
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
  artifactId?: string;
  finalContractDigest?: string;
  reconciliationDigest?: string;
  /** Server-derived final proof retained so persistence can verify digest binding. */
  finalForensicContract?: Record<string, Json>;
  /** Server-derived reconciliation retained so persistence can verify its digest. */
  reconciliationProof?: Record<string, Json>;
}

const DIGEST_KEYS = [
  "evidence_version",
  "manifest",
  "event_coverage",
  "raw_events",
  "raw_player_info",
  "player_coverage",
  "tick_coverage",
  "tick_samples",
  "grenade_coverage",
  "grenade_samples",
  "round_evidence",
  "economy_coverage",
  "field_mappings",
  "gates",
] as const;

function canonicalValue(value: unknown): string {
  if (value === null || value === undefined) return "N;";
  if (typeof value === "boolean") return value ? "B1;" : "B0;";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "N;";
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, Object.is(value, -0) ? 0 : value, false);
    return `D${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")};`;
  }
  if (typeof value === "string") return `S${new TextEncoder().encode(value).length}:${value}`;
  if (Array.isArray(value)) return `A${value.length}[${value.map(canonicalValue).join("")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `O${entries.length}{${entries.map(([key, item]) => `${canonicalValue(key)}${canonicalValue(item)}`).join("")}}`;
  }
  throw new Error("unsupported RAW evidence value");
}

/** Stable UTF-8 JSON used by both parser and APP for the persisted RAW sections. */
export function canonicalizeRawEvidence(
  value: Pick<RawDemoEvidence, (typeof DIGEST_KEYS)[number]>,
): string {
  return canonicalValue(Object.fromEntries(DIGEST_KEYS.map((key) => [key, value[key]])));
}

export async function computeRawEvidenceDigest(evidence: RawDemoEvidence): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeRawEvidence(evidence));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    raw.raw_player_info,
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
export async function runRawForensicAudit(
  evidence: RawDemoEvidence,
): Promise<RawAdmissionDecision> {
  const reasons: string[] = [];
  let status: RawEvidenceStatus = "PASS";
  // Legacy evidence remains auditable but cannot satisfy the new exhaustive
  // Canonical gate. No historical artifact is rewritten or retro-approved.
  if (!evidence.forensic_contract_v2) {
    reasons.push("forensic_v2_missing");
  } else {
    const { validateRawForensicContractV2 } = await import("@/lib/pipeline/rawArtifactContract");
    reasons.push(...validateRawForensicContractV2(evidence.forensic_contract_v2));
  }
  const requiredInventoryKeys = [
    "header_inventory",
    "player_info_inventory",
    "game_state_inventory",
    "round_inventory",
    "bomb_inventory",
    "damage_inventory",
    "death_inventory",
    "weapon_inventory",
    "grenade_inventory",
    "usercmd_inventory",
    "teams_inventory",
    "score_inventory",
    "aggregate_inventory",
    "movement_inventory",
    "all_event_inventory",
    "selected_event_extraction",
    "actually_parsed_events",
    "mapping_inventory",
    "tick_sampling",
    "event_returned_field_inventory",
    "event_preserved_field_inventory",
    "event_non_null_field_inventory",
    "event_null_only_field_inventory",
    "player_info_returned_fields",
    "player_info_preserved_fields",
    "usercmd_capability",
    "game_state_capability",
    "game_state_requested",
    "game_state_returned",
    "game_state_preserved",
    "game_state_observed_in_sample",
    "game_state_mapping_inventory",
  ];

  if (!evidence.manifest) reasons.push("audit_manifest_missing");
  if (!evidence.deterministic_digest) reasons.push("raw_digest_missing");
  else if (!/^[0-9a-f]{64}$/.test(evidence.deterministic_digest))
    reasons.push("raw_digest_invalid");
  try {
    if ((await computeRawEvidenceDigest(evidence)) !== evidence.deterministic_digest) {
      reasons.push("raw_digest_mismatch");
    }
  } catch {
    reasons.push("raw_digest_unverifiable");
  }
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
  if (
    !manifest.parser_name ||
    !manifest.parser_version ||
    !manifest.demo_sha256 ||
    !manifest.contract_version
  ) {
    reasons.push("audit_identity_incomplete");
  }
  if (manifest.event_inventory_count !== manifest.event_inventory.length) {
    reasons.push("event_inventory_count_mismatch");
  }
  if (
    manifest.events_count !== evidence.raw_events.length ||
    manifest.event_rows !== evidence.raw_events.length
  ) {
    reasons.push("event_content_count_mismatch");
  }
  if (manifest.players_count !== evidence.raw_player_info.length)
    reasons.push("player_content_count_mismatch");
  if (manifest.tick_sample_rows !== evidence.tick_samples.length)
    reasons.push("tick_sample_count_mismatch");
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
    const rows = evidence.raw_events.filter((event) => event.event_name === coverage.event_name);
    const returned = unique(rows.flatMap((event) => Object.keys(event.raw_fields)));
    const nonNull = unique(
      rows.flatMap((event) =>
        Object.entries(event.raw_fields)
          .filter(([, value]) => value !== null)
          .map(([field]) => field),
      ),
    );
    const nullOnly = returned.filter((field) => !nonNull.includes(field));
    const advertisedReturned = unique(coverage.returned_fields ?? coverage.fields_available);
    const advertisedNonNull = unique(coverage.non_null_fields ?? coverage.fields_available);
    const advertisedNullOnly = unique(coverage.null_only_fields ?? []);
    const advertisedPreserved = unique(coverage.preserved_fields ?? returned);
    if (JSON.stringify(returned) !== JSON.stringify(advertisedReturned))
      reasons.push(`event_returned_inventory_mismatch:${coverage.event_name}`);
    if (JSON.stringify(nonNull) !== JSON.stringify(advertisedNonNull))
      reasons.push(`event_non_null_inventory_mismatch:${coverage.event_name}`);
    if (JSON.stringify(nullOnly) !== JSON.stringify(advertisedNullOnly))
      reasons.push(`event_null_only_inventory_mismatch:${coverage.event_name}`);
    if (JSON.stringify(returned) !== JSON.stringify(advertisedPreserved))
      reasons.push(`event_preserved_inventory_mismatch:${coverage.event_name}`);
    if (coverage.row_count !== null && coverage.row_count !== rows.length)
      reasons.push(`event_row_count_mismatch:${coverage.event_name}`);
    for (const field of advertisedReturned) {
      const qualified = `${coverage.event_name}.${field}`;
      if (!preservedEventFields.has(qualified))
        reasons.push(`returned_field_not_preserved:${qualified}`);
    }
    if (coverage.capability_state === "PARSE_FAILED")
      reasons.push(`parse_failed:event:${coverage.event_name}`);
  }
  const rawPlayerFields = new Set(evidence.raw_player_info.flatMap((row) => Object.keys(row)));
  const playerMappings = new Set(
    evidence.field_mappings
      .filter((mapping) => mapping.raw_field.startsWith("player."))
      .map((mapping) => mapping.raw_field.slice("player.".length)),
  );
  for (const field of rawPlayerFields) {
    if (!playerMappings.has(field)) reasons.push(`returned_field_not_in_mapping:player.${field}`);
  }
  for (const coverage of [
    ...evidence.player_coverage,
    ...evidence.tick_coverage,
    ...evidence.grenade_coverage,
  ]) {
    if (coverage.success === false || coverage.property === "__capability__")
      reasons.push(`parse_failed:property:${coverage.property}`);
  }
  const sampledStateFields = unique(evidence.tick_samples.flatMap((row) => Object.keys(row)));
  const coveredStateFields = unique(
    evidence.tick_coverage
      .filter((row) => row.property !== "__capability__")
      .map((row) => row.property),
  );
  for (const field of sampledStateFields) {
    if (!coveredStateFields.includes(field))
      reasons.push(`game_state_returned_without_coverage:${field}`);
    if (!mappedFields.has(`game_state.${field}`))
      reasons.push(`returned_field_not_in_mapping:game_state.${field}`);
  }
  const suppliedInventory = evidence.forensic_inventory;
  const inventoryList = (key: string): string[] => {
    const value = suppliedInventory?.[key];
    return Array.isArray(value)
      ? unique(value.filter((item): item is string => typeof item === "string"))
      : [];
  };
  for (const [key, computed] of [
    ["player_info_returned_fields", unique([...rawPlayerFields])],
    ["player_info_preserved_fields", unique([...rawPlayerFields])],
    ["game_state_returned", sampledStateFields],
    ["game_state_preserved", sampledStateFields],
    ["game_state_observed_in_sample", sampledStateFields],
  ] as const) {
    if (JSON.stringify(inventoryList(key)) !== JSON.stringify(computed))
      reasons.push(`audit_inventory_inconsistent:${key}`);
  }
  const eventInventoryObject = (key: string): Record<string, unknown> => {
    const value = suppliedInventory?.[key];
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  };
  for (const coverage of evidence.event_coverage) {
    const name = coverage.event_name;
    const rows = evidence.raw_events.filter((event) => event.event_name === name);
    const returned = unique(rows.flatMap((event) => Object.keys(event.raw_fields)));
    const nonNull = unique(
      rows.flatMap((event) =>
        Object.entries(event.raw_fields)
          .filter(([, value]) => value !== null)
          .map(([field]) => field),
      ),
    );
    const nullOnly = returned.filter((field) => !nonNull.includes(field));
    for (const [key, computed] of [
      ["event_returned_field_inventory", returned],
      ["event_preserved_field_inventory", returned],
      ["event_non_null_field_inventory", nonNull],
      ["event_null_only_field_inventory", nullOnly],
    ] as const) {
      const supplied = eventInventoryObject(key)[name];
      const suppliedFields = Array.isArray(supplied)
        ? unique(supplied.filter((item): item is string => typeof item === "string"))
        : [];
      if (JSON.stringify(suppliedFields) !== JSON.stringify(computed))
        reasons.push(`audit_inventory_inconsistent:${key}:${name}`);
    }
  }
  if (
    manifest.tick_sampling?.coverage !== "SAMPLE" ||
    manifest.tick_sampling.full_extraction !== false
  ) {
    reasons.push("tick_coverage_mischaracterized");
  }
  if (reasons.length > 0 && status !== "FAIL") status = "BLOCKED";
  const forensicInventory: Record<string, Json> = {
    header_inventory: Object.keys(manifest.raw_header ?? {}).sort(),
    player_info_inventory: evidence.player_coverage.map((row) => row.property).sort(),
    player_info_returned_fields: [...rawPlayerFields].sort(),
    player_info_preserved_fields: [...rawPlayerFields].sort(),
    game_state_inventory: coveredStateFields,
    game_state_capability: unique(
      (evidence.forensic_inventory?.["game_state_capability"] as string[] | undefined) ?? [],
    ),
    game_state_requested: unique(
      (evidence.forensic_inventory?.["game_state_requested"] as string[] | undefined) ?? [],
    ),
    game_state_returned: sampledStateFields,
    game_state_preserved: sampledStateFields,
    game_state_observed_in_sample: sampledStateFields,
    game_state_mapping_inventory: evidence.field_mappings.filter((row) =>
      row.raw_field.startsWith("game_state."),
    ) as unknown as Json,
    round_inventory: evidence.round_evidence
      .flatMap((row) => Object.keys(row))
      .filter(Boolean)
      .sort(),
    bomb_inventory: evidence.event_coverage
      .filter((row) => row.event_name.startsWith("bomb_"))
      .map((row) => row.event_name)
      .sort(),
    damage_inventory: evidence.event_coverage
      .filter((row) => row.event_name.includes("damage") || row.event_name === "player_hurt")
      .map((row) => row.event_name)
      .sort(),
    death_inventory: evidence.event_coverage
      .filter((row) => row.event_name === "player_death")
      .map((row) => row.event_name),
    weapon_inventory: evidence.event_coverage
      .filter((row) => row.event_name.includes("weapon") || row.event_name.startsWith("item_"))
      .map((row) => row.event_name)
      .sort(),
    grenade_inventory: evidence.grenade_coverage.map((row) => row.property).sort(),
    usercmd_inventory: evidence.tick_coverage
      .filter((row) =>
        [
          "buttons",
          "view_angles",
          "aim_punch_angle",
          "aim_punch_angle_vel",
          "shots_fired",
        ].includes(row.property),
      )
      .map((row) => row.property)
      .sort(),
    teams_inventory: evidence.player_coverage
      .filter((row) => row.property.includes("team") || row.property === "team_num")
      .map((row) => row.property)
      .sort(),
    score_inventory: evidence.player_coverage
      .filter(
        (row) =>
          row.property === "score" ||
          row.property.includes("score") ||
          row.property.includes("rounds_total"),
      )
      .map((row) => row.property)
      .sort(),
    aggregate_inventory: evidence.field_mappings
      .filter((row) => row.raw_field.includes("_total"))
      .map((row) => row.raw_field)
      .sort(),
    movement_inventory: evidence.tick_coverage
      .filter((row) =>
        [
          "X",
          "Y",
          "Z",
          "velocity",
          "velocity_X",
          "velocity_Y",
          "velocity_Z",
          "yaw",
          "pitch",
        ].includes(row.property),
      )
      .map((row) => row.property)
      .sort(),
    all_event_inventory: manifest.event_inventory,
    selected_event_extraction: manifest.selected_event_candidates,
    actually_parsed_events: manifest.parsed_event_tables,
    event_returned_field_inventory: Object.fromEntries(
      evidence.event_coverage.map((coverage) => [coverage.event_name, coverage.fields_available]),
    ) as Json,
    event_preserved_field_inventory: Object.fromEntries(
      evidence.event_coverage.map((coverage) => [
        coverage.event_name,
        unique(
          evidence.raw_events
            .filter((event) => event.event_name === coverage.event_name)
            .flatMap((event) => Object.keys(event.raw_fields)),
        ),
      ]),
    ) as Json,
    event_non_null_field_inventory: Object.fromEntries(
      evidence.event_coverage.map((coverage) => [
        coverage.event_name,
        unique(
          evidence.raw_events
            .filter((event) => event.event_name === coverage.event_name)
            .flatMap((event) =>
              Object.entries(event.raw_fields)
                .filter(([, value]) => value !== null)
                .map(([field]) => field),
            ),
        ),
      ]),
    ) as Json,
    event_null_only_field_inventory: Object.fromEntries(
      evidence.event_coverage.map((coverage) => {
        const rows = evidence.raw_events.filter(
          (event) => event.event_name === coverage.event_name,
        );
        const returned = unique(rows.flatMap((event) => Object.keys(event.raw_fields)));
        const nonNull = new Set(
          rows.flatMap((event) =>
            Object.entries(event.raw_fields)
              .filter(([, value]) => value !== null)
              .map(([field]) => field),
          ),
        );
        return [coverage.event_name, returned.filter((field) => !nonNull.has(field))];
      }),
    ) as Json,
    usercmd_capability: (evidence.forensic_inventory?.["usercmd_capability"] ?? {
      coverage: "UNAVAILABLE",
      source: "demoparser2_parse_ticks",
    }) as Json,
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
): asserts decision is RawAdmissionDecision & {
  approved: true;
  status: "PASS";
  auditStatus: "APPROVED";
} {
  if (!decision.approved || decision.status !== "PASS" || decision.auditStatus !== "APPROVED") {
    throw new Error(
      `RAW forensic admission denied: ${decision.reasons.join(",") || decision.status}`,
    );
  }
}

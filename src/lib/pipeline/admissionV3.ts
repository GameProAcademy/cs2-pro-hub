/**
 * RAW admission contract v3 — versioned, auditable admission with declared limitations.
 *
 * WHAT V3 IS
 * ----------
 * The forensic contract v2 (`rawArtifactContract.ts`) requires every producer gate to
 * PASS. Three of its gates cannot pass for any demo parsed by demoparser2 0.42.0,
 * because the parser exposes no independent authority for them (capability surface,
 * tick domain, usercmd). Five semantic gates (header, rounds, bomb, combat,
 * teams/score) are not proven by the producer either: the RAW evidence events carry
 * no round assignment, so the producer cannot relate them to rounds.
 *
 * V3 does not reinterpret v2. A v2 BLOCKED stays BLOCKED, is preserved verbatim in the
 * decision, and the v2 final contract is never produced for a v3 admission. V3 records
 * its own verdict:
 *
 *   PASS     every gate was verified and satisfied (v2 itself would admit)
 *   LIMITED  only limitations from the registry below remain, each matched by exact,
 *            codified evidence conditions, and every other condition was verified
 *   BLOCKED  any other failure, any unmatched reason, or any condition not proven
 *
 * `UNAVAILABLE` is an EVIDENCE state (a capability the parser does not provide). It is
 * never a verdict and never counts as success: an unavailable capability is admitted
 * only through a registered limitation whose forbidden metric classes are excluded.
 *
 * Semantic gates the producer could not prove are re-verified here, on the canonical
 * bundle that would be persisted (`verifyCanonicalSemanticsV3`). A failure there blocks.
 *
 * Everything in this module is pure: no I/O, no clock, no randomness.
 */
import { rawArtifactSha256, stableRawArtifactJson } from "@/lib/pipeline/rawArtifactContract";

export const ADMISSION_V3_CONTRACT = "cs2.raw-admission.v3" as const;
export const ADMISSION_V3_RULESET_VERSION = 1 as const;

export type AdmissionVerdictV3 = "PASS" | "LIMITED" | "BLOCKED";
export type EvidenceStateV3 = "PASS" | "UNAVAILABLE" | "UNPROVEN" | "FAILED";
export type GateDecisionV3 =
  "PASS" | "LIMITED" | "PENDING_CANONICAL_VERIFICATION" | "PENDING_PHYSICAL_REAUDIT" | "BLOCKED";

/* ------------------------------------------------------------------ *
 * Metric data classes and the limitation registry                     *
 * ------------------------------------------------------------------ */

/**
 * Classes of source data a persisted value can depend on. A limitation forbids the
 * classes whose correctness it cannot support.
 */
export type MetricDataClass =
  /** Game events (player_death, player_hurt, bomb_*, grenade detonations, ...). */
  | "EVENTS"
  /** Round lifecycle and outcome (boundaries, winner, win reason). */
  | "ROUNDS"
  /** Player state observed at an exact event tick (side, money, equipment). */
  | "STATE_AT_EVENT_TICK"
  /** The demo's own declared tickrate (time = tick / tickrate). */
  | "DECLARED_TICKRATE"
  /** Every tick of the demo, continuously (movement, positioning, exposure time). */
  | "CONTINUOUS_TICK_STREAM"
  /** Client input (buttons, view angles, recoil, counter-strafe, spray). */
  | "USER_INPUT"
  /** A claim that the parser's capability catalog is exhaustive. */
  | "CAPABILITY_COMPLETENESS"
  /** Team assignment, map score and the match result derived from them. */
  | "MATCH_RESULT";

export interface LimitationSpecV3 {
  id: string;
  gates: readonly string[];
  unavailable: string;
  justification: string;
  evidence: string;
  impact: string;
  forbiddenDataClasses: readonly MetricDataClass[];
  restrictions: string;
}

export const LIMITATIONS_V3: Readonly<Record<string, LimitationSpecV3>> = {
  "L01-CAPABILITY-SURFACE-UNENUMERABLE": {
    id: "L01-CAPABILITY-SURFACE-UNENUMERABLE",
    gates: ["RAW-V2-02-capability-catalog"],
    unavailable:
      "an independent, exhaustive enumeration of the demoparser2 0.42.0 runtime capability surface",
    justification:
      "demoparser2 0.42.0 exposes callable methods but no API that enumerates every capability; the worker records the runtime surface as UNAVAILABLE by construction (capability_catalog.inspect_installed_runtime_surface).",
    evidence:
      "capability catalog structurally valid (no catalog reasons), catalog.complete=true, reconciliation has zero unresolved, duplicate, orphan and set-difference entries, and its only failure is runtime_surface_status=UNAVAILABLE.",
    impact:
      "No persisted value depends on capability completeness: every persisted field comes from an explicitly requested, mapped and classified field (gates RAW-V2-09 and RAW-V2-20 must PASS).",
    forbiddenDataClasses: ["CAPABILITY_COMPLETENESS"],
    restrictions:
      "The match may never be described as having an exhaustive parser capability audit.",
  },
  "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE": {
    id: "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
    gates: ["RAW-V2-05-full-tick-domain", "RAW-V2-06-tick-batches"],
    unavailable: "an independent authority for the complete tick domain of the demo",
    justification:
      "demoparser2 0.42.0 has no documented API that enumerates every valid demo tick; parse_header.playback_ticks is not part of its documented contract, so the worker refuses a full-domain claim and issues no tick batches (forensic_audit.build_tick_domain_source).",
    evidence:
      "tick_domain_source status UNAVAILABLE and not authoritative, zero batches attempted, failures exactly expected_tick_domain_unavailable and verified_independent_tick_authority_required, and zero missing, duplicate, invalid, out-of-order or overlapping ticks (gates RAW-V2-07 and RAW-V2-08 must PASS).",
    impact:
      "Values computed from the continuous per-tick stream cannot be shown correct. Events and player state read at exact event ticks are not affected: they are observed rows, not a claim about every tick.",
    forbiddenDataClasses: ["CONTINUOUS_TICK_STREAM"],
    restrictions:
      "No movement, positioning, exposure-time or other continuous-stream metric may be persisted or shown for the match.",
  },
  "L04-MATCH-RESULT-UNRESOLVED": {
    id: "L04-MATCH-RESULT-UNRESOLVED",
    gates: ["RAW-V2-16-teams-score"],
    unavailable: "team assignment, round winners by team and the map score",
    justification:
      "Some demos carry no team assignment for their participants, so no round winner can be attributed to a team and no map score can be derived. Nothing is inferred.",
    evidence:
      "on the canonical bundle: no participant has a team, no round has a winning team, and both map scores and the match winner are null. Any partial or contradictory team/score data is BLOCKED, never LIMITED.",
    impact:
      "The match result (win/loss/draw), the map score and the team columns of the player projection cannot be known; they are persisted as null. Per-player event metrics do not use team slots.",
    forbiddenDataClasses: ["MATCH_RESULT"],
    restrictions:
      "The match never counts toward win rate or any result-based aggregate; it shows no result.",
  },
  "L03-USERCMD-UNAVAILABLE": {
    id: "L03-USERCMD-UNAVAILABLE",
    gates: ["RAW-V2-17-usercmd"],
    unavailable: "an audited client usercmd (input) stream",
    justification:
      "demoparser2 0.42.0 accepts usercmd_* properties in parse_ticks, but server-recorded (GOTV) demos do not populate them: on the public fixture demo, 12 usercmd_* properties requested over 640 ticks returned no column. The worker neither requests nor audits usercmd and records its coverage as UNAVAILABLE (raw_evidence.forensic_inventory); availability in POV demos is not claimed either way.",
    evidence:
      "gate reason exactly usercmd_unavailable_or_unproven and semantic_inventories.usercmd_capability.coverage=UNAVAILABLE.",
    impact:
      "Input-derived analyses cannot be computed or verified. No persisted metric reads input data (metrics.ts and features.ts reference no usercmd property).",
    forbiddenDataClasses: ["USER_INPUT"],
    restrictions:
      "No crosshair-placement, counter-strafe, spray-control or reaction-time analysis may be persisted or shown for the match.",
  },
};

/**
 * Every `match_metrics` value the pipeline persists, with the data classes it is
 * computed from (src/lib/pipeline/metrics.ts). A new metric MUST be added here; the
 * test suite fails if a persisted column is missing.
 */
export const METRIC_DATA_DEPENDENCIES_V3: Readonly<Record<string, readonly MetricDataClass[]>> = {
  kills: ["EVENTS", "ROUNDS"],
  deaths: ["EVENTS", "ROUNDS"],
  assists: ["EVENTS", "ROUNDS"],
  adr: ["EVENTS", "ROUNDS"],
  kast: ["EVENTS", "ROUNDS", "DECLARED_TICKRATE"],
  hs_percent: ["EVENTS"],
  first_kills: ["EVENTS", "ROUNDS"],
  first_deaths: ["EVENTS", "ROUNDS"],
  opening_success: ["EVENTS", "ROUNDS"],
  opening_attempts: ["EVENTS", "ROUNDS"],
  opening_success_rate: ["EVENTS", "ROUNDS"],
  clutches: ["EVENTS", "ROUNDS", "STATE_AT_EVENT_TICK"],
  clutch_attempts: ["EVENTS", "ROUNDS", "STATE_AT_EVENT_TICK"],
  clutch_wins: ["EVENTS", "ROUNDS", "STATE_AT_EVENT_TICK"],
  multi_kills: ["EVENTS", "ROUNDS"],
  utility_damage: ["EVENTS", "ROUNDS"],
  flash_assists: ["EVENTS", "ROUNDS"],
  grenade_damage: ["EVENTS", "ROUNDS"],
  trade_kills: ["EVENTS", "ROUNDS", "DECLARED_TICKRATE"],
  trade_deaths: ["EVENTS", "ROUNDS", "DECLARED_TICKRATE"],
  damage_taken: ["EVENTS", "ROUNDS"],
  damage_efficiency: ["EVENTS", "ROUNDS"],
  ct_rating: ["EVENTS", "ROUNDS", "STATE_AT_EVENT_TICK", "DECLARED_TICKRATE"],
  t_rating: ["EVENTS", "ROUNDS", "STATE_AT_EVENT_TICK", "DECLARED_TICKRATE"],
  rating: ["EVENTS", "ROUNDS", "DECLARED_TICKRATE"],
  rounds_played: ["ROUNDS", "EVENTS"],
};

/**
 * Player-projection columns of `matches` (persistence.server.ts `playerScoped`) and the
 * data classes they are derived from.
 */
export const PROJECTION_DATA_DEPENDENCIES_V3: Readonly<Record<string, readonly MetricDataClass[]>> =
  {
    "matches.team_player": ["MATCH_RESULT"],
    "matches.team_opponent": ["MATCH_RESULT"],
    "matches.score_player": ["MATCH_RESULT", "ROUNDS"],
    "matches.score_opponent": ["MATCH_RESULT", "ROUNDS"],
    "matches.result": ["MATCH_RESULT", "ROUNDS"],
  };

/** The metrics and projection columns a set of limitations forbids, in a stable order. */
export function excludedMetricsFor(limitations: readonly string[]): string[] {
  const forbidden = new Set<MetricDataClass>();
  for (const id of limitations) {
    const spec = LIMITATIONS_V3[id];
    if (!spec) throw new Error(`admission_v3_unknown_limitation:${id}`);
    for (const dataClass of spec.forbiddenDataClasses) forbidden.add(dataClass);
  }
  return Object.entries({ ...METRIC_DATA_DEPENDENCIES_V3, ...PROJECTION_DATA_DEPENDENCIES_V3 })
    .filter(([, classes]) => classes.some((dataClass) => forbidden.has(dataClass)))
    .map(([metric]) => metric)
    .sort();
}

/* ------------------------------------------------------------------ *
 * Phase A: classify the v2 producer contract                          *
 * ------------------------------------------------------------------ */

/** v2 semantic gates the producer cannot prove, re-verified on the canonical bundle. */
export const CANONICAL_VERIFIED_GATES_V3: Readonly<Record<string, string>> = {
  "RAW-V2-10-header": "header_semantics_unproven",
  "RAW-V2-12-rounds": "round_lifecycle_or_containment_invalid",
  "RAW-V2-13-bomb": "bomb_lifecycle_unproven",
  "RAW-V2-14-combat": "combat_relationships_unproven",
  "RAW-V2-16-teams-score": "team_score_provenance_unproven",
};

const PHYSICAL_GATE = "RAW-V2-22-physical-reaudit";
const TICK_AUTHORITY_FAILURES = [
  "expected_tick_domain_unavailable",
  "verified_independent_tick_authority_required",
];

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const sameSet = (left: readonly unknown[], right: readonly unknown[]) =>
  left.length === right.length &&
  [...left].map(String).sort().join("\u0000") === [...right].map(String).sort().join("\u0000");
const zero = (value: unknown) => value === 0;
const zeroOrAbsent = (value: unknown) => value === 0 || value === null || value === undefined;

export interface GateResultV3 {
  gate: string;
  v2Status: string;
  v2Reasons: string[];
  evidence: EvidenceStateV3;
  decision: GateDecisionV3;
  rule: string;
  limitation?: string;
  blockedReason?: string;
}

export interface EvidenceClassificationV3 {
  contract: typeof ADMISSION_V3_CONTRACT;
  rulesetVersion: typeof ADMISSION_V3_RULESET_VERSION;
  status: "ELIGIBLE" | "BLOCKED";
  /** v2 producer-stage reasons exactly as the v2 validator returned them. */
  v2ProducerReasons: string[];
  v2ProducerGateStatus: string | null;
  v2ContractDigest: string | null;
  gates: GateResultV3[];
  limitations: string[];
  pendingCanonicalVerification: string[];
  blockedReasons: string[];
}

function l01Holds(contract: Rec): boolean {
  const reconciliation = rec(contract["capability_reconciliation"]);
  const catalog = rec(contract["capability_catalog"]);
  const surface = rec(catalog["installed_runtime_surface"]);
  return (
    reconciliation["status"] === "BLOCKED" &&
    reconciliation["runtime_surface_status"] === "UNAVAILABLE" &&
    zero(reconciliation["unresolved_count"]) &&
    zero(reconciliation["duplicate_count"]) &&
    zero(reconciliation["orphan_count"]) &&
    zero(reconciliation["set_difference_count"]) &&
    arr(reconciliation["duplicates"]).length === 0 &&
    arr(reconciliation["unresolved"]).length === 0 &&
    arr(reconciliation["capabilities_without_provenance"]).length === 0 &&
    arr(reconciliation["duplicate_runtime_symbols"]).length === 0 &&
    arr(reconciliation["duplicate_mapping_entries"]).length === 0 &&
    catalog["complete"] === true &&
    typeof catalog["catalog_digest"] === "string" &&
    surface["status"] === "UNAVAILABLE" &&
    surface["complete"] === false &&
    arr(surface["errors"]).length === 0
  );
}

function l02Holds(contract: Rec): boolean {
  const tick = rec(contract["full_tick_audit"]);
  const source = rec(tick["tick_domain_source"]);
  const proof = rec(tick["full_tick_domain_proof"]);
  return (
    source["status"] === "UNAVAILABLE" &&
    source["authoritative"] === false &&
    typeof source["digest"] === "string" &&
    contract["tick_authority_digest"] === source["digest"] &&
    tick["complete"] === false &&
    tick["domain_proof_status"] === "BLOCKED" &&
    proof["status"] === "BLOCKED" &&
    zero(tick["batch_count"]) &&
    arr(tick["batches"]).length === 0 &&
    sameSet(arr(tick["failures"]), TICK_AUTHORITY_FAILURES) &&
    zero(tick["missing_tick_count"]) &&
    zero(tick["duplicate_tick_count"]) &&
    zero(tick["invalid_tick_count"]) &&
    zero(tick["out_of_order_tick_count"]) &&
    arr(tick["overlaps"]).length === 0 &&
    zeroOrAbsent(proof["overlap_count"])
  );
}

function l03Holds(contract: Rec): boolean {
  const capability = rec(rec(contract["semantic_inventories"])["usercmd_capability"]);
  return capability["coverage"] === "UNAVAILABLE";
}

/**
 * v2 producer reasons that v3 can account for, and the condition under which it may.
 * Every other v2 reason blocks: digests, identity, mapping, inventories, gate count.
 */
function absorbableV2Reason(reason: string, contract: Rec, gates: GateResultV3[]): boolean {
  if (reason === "forensic_v2_capability_reconciliation_failed") return l01Holds(contract);
  if (reason === "forensic_v2_full_tick_unproven") return l02Holds(contract);
  if (reason === "forensic_v2_producer_decision_invalid") {
    return (
      contract["producer_gate_status"] === "BLOCKED" &&
      contract["physical_gate_status"] === "PENDING" &&
      contract["final_gate_status"] === "BLOCKED" &&
      contract["canonical_admission"] === "BLOCKED" &&
      gates.every((gate) => gate.decision !== "BLOCKED")
    );
  }
  const blockedGate = /^forensic_v2_gate_blocked:(.+)$/.exec(reason);
  if (blockedGate) {
    const gate = gates.find((item) => item.gate === blockedGate[1]);
    return (
      !!gate && (gate.decision === "LIMITED" || gate.decision === "PENDING_CANONICAL_VERIFICATION")
    );
  }
  return false;
}

/**
 * Classifies a v2 producer contract (already shape-validated by the v2 validator,
 * whose reasons are passed in unchanged). The v2 contract is never mutated.
 */
export function classifyForensicV2ForAdmissionV3(
  v2Contract: unknown,
  v2ProducerReasons: readonly string[],
): EvidenceClassificationV3 {
  const contract = rec(v2Contract);
  const blockedReasons: string[] = [];
  const gates: GateResultV3[] = [];
  const declared = arr(contract["gates"]).map(rec);
  const byName = new Map(declared.map((gate) => [String(gate["gate"]), gate]));
  const order = [...byName.keys()];

  for (const name of order) {
    const gate = byName.get(name)!;
    const v2Status = String(gate["status"] ?? "");
    const v2Reasons = arr(gate["reasons"]).map(String);
    const base = { gate: name, v2Status, v2Reasons };
    const blocked = (rule: string, reason: string): GateResultV3 => ({
      ...base,
      evidence: v2Status === "PASS" ? "PASS" : "FAILED",
      decision: "BLOCKED",
      rule,
      blockedReason: reason,
    });

    if (name === PHYSICAL_GATE) {
      gates.push(
        v2Status === "BLOCKED" && sameSet(v2Reasons, ["physical_chunk_reaudit_pending_app"])
          ? { ...base, evidence: "UNPROVEN", decision: "PENDING_PHYSICAL_REAUDIT", rule: "V3-R22" }
          : blocked("V3-R22", "physical_gate_state_invalid"),
      );
      continue;
    }
    if (v2Status === "PASS") {
      gates.push(
        v2Reasons.length === 0
          ? { ...base, evidence: "PASS", decision: "PASS", rule: "V3-R00" }
          : blocked("V3-R00", "pass_with_reasons"),
      );
      continue;
    }
    if (v2Status !== "BLOCKED") {
      gates.push(blocked("V3-R00", "gate_status_invalid"));
      continue;
    }
    if (name === "RAW-V2-02-capability-catalog") {
      gates.push(
        sameSet(v2Reasons, ["capability_reconciliation_failed"]) && l01Holds(contract)
          ? {
              ...base,
              evidence: "UNAVAILABLE",
              decision: "LIMITED",
              rule: "V3-L01",
              limitation: "L01-CAPABILITY-SURFACE-UNENUMERABLE",
            }
          : blocked("V3-L01", "capability_catalog_failure_not_limited_to_runtime_surface"),
      );
      continue;
    }
    if (name === "RAW-V2-05-full-tick-domain" || name === "RAW-V2-06-tick-batches") {
      const expected =
        name === "RAW-V2-05-full-tick-domain" ? TICK_AUTHORITY_FAILURES : ["tick_batch_failed"];
      gates.push(
        sameSet(v2Reasons, expected) && l02Holds(contract)
          ? {
              ...base,
              evidence: "UNAVAILABLE",
              decision: "LIMITED",
              rule: "V3-L02",
              limitation: "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
            }
          : blocked("V3-L02", "tick_failure_not_limited_to_missing_authority"),
      );
      continue;
    }
    if (name === "RAW-V2-17-usercmd") {
      gates.push(
        sameSet(v2Reasons, ["usercmd_unavailable_or_unproven"]) && l03Holds(contract)
          ? {
              ...base,
              evidence: "UNAVAILABLE",
              decision: "LIMITED",
              rule: "V3-L03",
              limitation: "L03-USERCMD-UNAVAILABLE",
            }
          : blocked("V3-L03", "usercmd_failure_not_limited_to_unavailability"),
      );
      continue;
    }
    const unproven = CANONICAL_VERIFIED_GATES_V3[name];
    if (unproven) {
      gates.push(
        sameSet(v2Reasons, [unproven])
          ? {
              ...base,
              evidence: "UNPROVEN",
              decision: "PENDING_CANONICAL_VERIFICATION",
              rule: "V3-S",
            }
          : blocked("V3-S", "semantic_failure_not_limited_to_unproven"),
      );
      continue;
    }
    gates.push(blocked("V3-R00", "gate_has_no_v3_rule"));
  }

  for (const gate of gates) {
    if (gate.decision === "BLOCKED") blockedReasons.push(`v3:${gate.gate}:${gate.blockedReason}`);
  }
  if (!byName.has(PHYSICAL_GATE)) blockedReasons.push("v3:physical_gate_missing");
  for (const reason of v2ProducerReasons) {
    if (!absorbableV2Reason(reason, contract, gates)) blockedReasons.push(`v3:v2_reason:${reason}`);
  }
  // The v2 contract digest must be self-consistent before anything is admitted.
  const unsigned = Object.fromEntries(
    Object.entries(contract).filter(
      ([key]) =>
        key !== "deterministic_digest" &&
        key !== "unsigned_contract_digest" &&
        key !== "final_contract_digest",
    ),
  );
  const digest = rawArtifactSha256(stableRawArtifactJson(unsigned));
  if (
    contract["deterministic_digest"] !== digest ||
    contract["unsigned_contract_digest"] !== digest
  )
    blockedReasons.push("v3:v2_contract_digest_invalid");

  const limitations = [
    ...new Set(gates.flatMap((gate) => (gate.limitation ? [gate.limitation] : []))),
  ].sort();
  const pendingCanonicalVerification = gates
    .filter((gate) => gate.decision === "PENDING_CANONICAL_VERIFICATION")
    .map((gate) => gate.gate);
  const uniqueBlocked = [...new Set(blockedReasons)].sort();
  return {
    contract: ADMISSION_V3_CONTRACT,
    rulesetVersion: ADMISSION_V3_RULESET_VERSION,
    status: uniqueBlocked.length ? "BLOCKED" : "ELIGIBLE",
    v2ProducerReasons: [...v2ProducerReasons].sort(),
    v2ProducerGateStatus:
      typeof contract["producer_gate_status"] === "string"
        ? (contract["producer_gate_status"] as string)
        : null,
    v2ContractDigest:
      typeof contract["deterministic_digest"] === "string"
        ? (contract["deterministic_digest"] as string)
        : null,
    gates,
    limitations,
    pendingCanonicalVerification,
    blockedReasons: uniqueBlocked,
  };
}

/* ------------------------------------------------------------------ *
 * Phase B: semantic verification on the canonical bundle              *
 * ------------------------------------------------------------------ */

export interface SemanticBundleV3 {
  match: {
    map: string | null;
    scoreTeamA: number | null;
    scoreTeamB: number | null;
    winnerTeam: string | null;
    roundCount: number | null;
  };
  participants: ReadonlyArray<{ participantKey: string; team: string | null }>;
  rounds: ReadonlyArray<{
    roundNumber: number;
    startTick: number | null;
    endTick: number | null;
    winningTeam: string | null;
    bombPlanted: boolean | null;
    bombDefused: boolean | null;
    bombExploded: boolean | null;
  }>;
  events: ReadonlyArray<{
    roundNumber: number;
    type: string;
    tick: number | null;
    actorParticipantKey: string | null;
    victimParticipantKey: string | null;
    damage: number | null;
  }>;
}

export interface SemanticCheckV3 {
  gate: string;
  /** LIMITED only for a registered limitation whose exact condition holds. */
  status: "PASS" | "LIMITED" | "BLOCKED";
  limitation?: string;
  reasons: string[];
  facts: Record<string, number | string | null>;
}

const MAP_CODE = /^[a-z0-9_]+$/;

/**
 * Re-verifies, on the data that would be persisted, each semantic property the v2
 * producer could not prove. `rawHeaderMap` is the map name sealed in the RAW
 * manifest's audit evidence, so the header check crosses two independent records.
 */
export function verifyCanonicalSemanticsV3(
  bundle: SemanticBundleV3,
  rawHeaderMap: string | null,
): SemanticCheckV3[] {
  const rounds = [...bundle.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const roundByNumber = new Map(rounds.map((round) => [round.roundNumber, round]));
  const participants = new Map(bundle.participants.map((p) => [p.participantKey, p]));
  const checks: SemanticCheckV3[] = [];

  // RAW-V2-10 header: a map is declared, and equals the RAW header's own map name.
  {
    const reasons: string[] = [];
    const canonical = bundle.match.map;
    const raw = rawHeaderMap ? rawHeaderMap.trim().toLowerCase() : null;
    if (!canonical || !MAP_CODE.test(canonical)) reasons.push("canonical_map_missing");
    if (!raw) reasons.push("raw_header_map_missing");
    if (canonical && raw && canonical !== raw)
      reasons.push("canonical_map_differs_from_raw_header");
    checks.push({
      gate: "RAW-V2-10-header",
      status: reasons.length ? "BLOCKED" : "PASS",
      reasons,
      facts: { canonical_map: canonical, raw_header_map: raw },
    });
  }

  // RAW-V2-12 rounds: contiguous numbering, ordered non-overlapping closed intervals,
  // and every event inside its own round's interval.
  {
    const reasons: string[] = [];
    rounds.forEach((round, index) => {
      if (round.roundNumber !== index + 1) reasons.push("round_numbering_not_contiguous");
      if (round.startTick == null || round.endTick == null) reasons.push("round_boundary_unknown");
      else if (round.endTick < round.startTick) reasons.push("round_ends_before_start");
      const next = rounds[index + 1];
      if (next?.startTick != null && round.endTick != null && next.startTick <= round.endTick)
        reasons.push("round_intervals_overlap");
    });
    if (!rounds.length) reasons.push("no_rounds");
    if (bundle.match.roundCount != null && bundle.match.roundCount !== rounds.length)
      reasons.push("round_count_mismatch");
    let outside = 0;
    for (const event of bundle.events) {
      const round = roundByNumber.get(event.roundNumber);
      if (!round) {
        outside += 1;
        continue;
      }
      if (
        event.tick == null ||
        (round.startTick != null && event.tick < round.startTick) ||
        (round.endTick != null && event.tick > round.endTick)
      )
        outside += 1;
    }
    if (outside) reasons.push("event_outside_round_interval");
    checks.push({
      gate: "RAW-V2-12-rounds",
      status: reasons.length ? "BLOCKED" : "PASS",
      reasons: [...new Set(reasons)],
      facts: {
        rounds: rounds.length,
        events: bundle.events.length,
        events_outside_rounds: outside,
      },
    });
  }

  // RAW-V2-13 bomb: defuse/explode only after a plant in the same round, at most one
  // of each per round, and round flags agree with the events.
  {
    const reasons: string[] = [];
    let plants = 0;
    for (const round of rounds) {
      const own = bundle.events
        .filter(
          (event) => event.roundNumber === round.roundNumber && event.type.startsWith("bomb_"),
        )
        .sort((a, b) => (a.tick ?? -1) - (b.tick ?? -1));
      const plant = own.filter((event) => event.type === "bomb_plant");
      const defuse = own.filter((event) => event.type === "bomb_defuse");
      const explode = own.filter((event) => event.type === "bomb_explode");
      plants += plant.length;
      if (plant.length > 1 || defuse.length > 1 || explode.length > 1)
        reasons.push("bomb_event_repeated_in_round");
      if (defuse.length && explode.length) reasons.push("bomb_defused_and_exploded");
      const plantTick = plant[0]?.tick ?? null;
      for (const terminal of [...defuse, ...explode]) {
        if (plantTick == null || terminal.tick == null || terminal.tick < plantTick)
          reasons.push("bomb_terminal_without_prior_plant");
      }
      const flags: Array<[boolean | null, number, string]> = [
        [round.bombPlanted, plant.length, "planted"],
        [round.bombDefused, defuse.length, "defused"],
        [round.bombExploded, explode.length, "exploded"],
      ];
      for (const [flag, count, label] of flags) {
        if (flag === null) reasons.push(`round_bomb_${label}_flag_unknown`);
        else if (flag !== count > 0) reasons.push(`round_bomb_${label}_flag_disagrees`);
      }
    }
    checks.push({
      gate: "RAW-V2-13-bomb",
      status: reasons.length ? "BLOCKED" : "PASS",
      reasons: [...new Set(reasons)].sort(),
      facts: { plants },
    });
  }

  // RAW-V2-14 combat: every kill has a known victim and a known (or world) attacker,
  // nobody dies twice in a round, damage is a non-negative number between participants.
  {
    const reasons: string[] = [];
    const kills = bundle.events.filter((event) => event.type === "kill");
    const damage = bundle.events.filter((event) => event.type === "damage");
    const deathsPerRound = new Set<string>();
    for (const kill of kills) {
      if (!kill.victimParticipantKey || !participants.has(kill.victimParticipantKey))
        reasons.push("kill_victim_unknown");
      if (kill.actorParticipantKey && !participants.has(kill.actorParticipantKey))
        reasons.push("kill_attacker_unknown");
      const key = `${kill.roundNumber}:${kill.victimParticipantKey}`;
      if (deathsPerRound.has(key)) reasons.push("victim_died_twice_in_round");
      deathsPerRound.add(key);
    }
    for (const hit of damage) {
      if (hit.damage == null || !Number.isFinite(hit.damage) || hit.damage < 0)
        reasons.push("damage_value_invalid");
      if (!hit.victimParticipantKey || !participants.has(hit.victimParticipantKey))
        reasons.push("damage_victim_unknown");
      if (hit.actorParticipantKey && !participants.has(hit.actorParticipantKey))
        reasons.push("damage_attacker_unknown");
    }
    if (!kills.length) reasons.push("no_kills");
    checks.push({
      gate: "RAW-V2-14-combat",
      status: reasons.length ? "BLOCKED" : "PASS",
      reasons: [...new Set(reasons)].sort(),
      facts: { kills: kills.length, damage_events: damage.length },
    });
  }

  // RAW-V2-16 teams/score: every round has a winning team, and the declared map score
  // equals the count of rounds each team won. Complete absence of team data (and only
  // complete absence) is limitation L04: the result is unknown, not contradictory.
  {
    const noTeamData =
      bundle.participants.every((p) => p.team == null) &&
      rounds.every((round) => round.winningTeam == null) &&
      bundle.match.scoreTeamA == null &&
      bundle.match.scoreTeamB == null &&
      bundle.match.winnerTeam == null;
    const reasons: string[] = [];
    const won: Record<string, number> = {};
    for (const round of rounds) {
      if (round.winningTeam == null) reasons.push("round_winner_unknown");
      else won[round.winningTeam] = (won[round.winningTeam] ?? 0) + 1;
    }
    const a = bundle.match.scoreTeamA;
    const b = bundle.match.scoreTeamB;
    if (a == null || b == null) reasons.push("map_score_unknown");
    else if ((won["team_a"] ?? 0) !== a || (won["team_b"] ?? 0) !== b)
      reasons.push("score_differs_from_round_winners");
    if (Object.keys(won).some((team) => team !== "team_a" && team !== "team_b"))
      reasons.push("round_winner_not_a_team_slot");
    const teams = new Set(bundle.participants.map((p) => p.team).filter((team) => team != null));
    if (teams.size !== 2 || !teams.has("team_a") || !teams.has("team_b"))
      reasons.push("team_assignment_not_two_teams");
    const limited = noTeamData && rounds.length > 0 && bundle.participants.length > 0;
    checks.push({
      gate: "RAW-V2-16-teams-score",
      status: limited ? "LIMITED" : reasons.length ? "BLOCKED" : "PASS",
      ...(limited ? { limitation: "L04-MATCH-RESULT-UNRESOLVED" } : {}),
      reasons: [...new Set(reasons)].sort(),
      facts: {
        score_a: a,
        score_b: b,
        rounds_won_a: won["team_a"] ?? 0,
        rounds_won_b: won["team_b"] ?? 0,
      },
    });
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * Final decision                                                      *
 * ------------------------------------------------------------------ */

export interface AdmissionDecisionV3 {
  contract: typeof ADMISSION_V3_CONTRACT;
  ruleset_version: typeof ADMISSION_V3_RULESET_VERSION;
  verdict: AdmissionVerdictV3;
  job_id: string;
  upload_id: string;
  attempt_number: number;
  artifact_id: string;
  demo_sha256: string;
  parser: { name: string; version: string; revision: string | null; build_revision: string | null };
  v2: {
    producer_gate_status: string | null;
    producer_reasons: string[];
    contract_digest: string | null;
    final_contract_produced: false;
  };
  gates: GateResultV3[];
  semantic_checks: SemanticCheckV3[];
  limitations: string[];
  excluded_metrics: string[];
  physical: { artifact_root_digest: string; reconciliation_digest: string | null };
  blocked_reasons: string[];
  decision_digest: string;
}

export function decideAdmissionV3(args: {
  evidence: EvidenceClassificationV3;
  semantic: readonly SemanticCheckV3[];
  identity: {
    jobId: string;
    uploadId: string;
    attemptNumber: number;
    artifactId: string;
    demoSha256: string;
    parser: AdmissionDecisionV3["parser"];
  };
  /** reconciliationDigest is null when the physical re-audit did not run. */
  physical: { artifactRootDigest: string; reconciliationDigest: string | null };
}): AdmissionDecisionV3 {
  const blocked = [...args.evidence.blockedReasons];
  const verified = new Map(args.semantic.map((check) => [check.gate, check]));
  const semanticLimitations: string[] = [];
  if (args.evidence.status === "ELIGIBLE") {
    for (const gate of args.evidence.pendingCanonicalVerification) {
      const check = verified.get(gate);
      if (!check) blocked.push(`v3:${gate}:canonical_verification_missing`);
      else if (check.status === "LIMITED") {
        if (!check.limitation || !LIMITATIONS_V3[check.limitation]?.gates.includes(gate))
          blocked.push(`v3:${gate}:limitation_not_registered_for_gate`);
        else semanticLimitations.push(check.limitation);
      } else if (check.status !== "PASS")
        blocked.push(...check.reasons.map((reason) => `v3:${gate}:${reason}`));
    }
  }
  if (!/^[0-9a-f]{64}$/.test(args.physical.artifactRootDigest))
    blocked.push("v3:physical_root_digest_invalid");
  if (args.physical.reconciliationDigest === null) blocked.push("v3:physical_reaudit_not_run");
  else if (!/^[0-9a-f]{64}$/.test(args.physical.reconciliationDigest))
    blocked.push("v3:physical_reconciliation_digest_invalid");
  const gates = args.evidence.gates.map((gate) => {
    if (gate.decision === "PENDING_PHYSICAL_REAUDIT" && !blocked.length)
      return { ...gate, evidence: "PASS" as const, decision: "PASS" as const };
    if (gate.decision === "PENDING_CANONICAL_VERIFICATION") {
      const check = verified.get(gate.gate);
      if (check?.status === "PASS")
        return { ...gate, evidence: "PASS" as const, decision: "PASS" as const, rule: "V3-S" };
      if (
        check?.status === "LIMITED" &&
        check.limitation &&
        semanticLimitations.includes(check.limitation)
      )
        return {
          ...gate,
          evidence: "UNAVAILABLE" as const,
          decision: "LIMITED" as const,
          rule: "V3-S",
          limitation: check.limitation,
        };
      return {
        ...gate,
        decision: "BLOCKED" as const,
        blockedReason: "canonical_verification_failed",
      };
    }
    return gate;
  });
  const limitations = [...new Set([...args.evidence.limitations, ...semanticLimitations])].sort();
  const uniqueBlocked = [...new Set(blocked)].sort();
  const verdict: AdmissionVerdictV3 = uniqueBlocked.length
    ? "BLOCKED"
    : limitations.length
      ? "LIMITED"
      : "PASS";
  const body: Omit<AdmissionDecisionV3, "decision_digest"> = {
    contract: ADMISSION_V3_CONTRACT,
    ruleset_version: ADMISSION_V3_RULESET_VERSION,
    verdict,
    job_id: args.identity.jobId,
    upload_id: args.identity.uploadId,
    attempt_number: args.identity.attemptNumber,
    artifact_id: args.identity.artifactId,
    demo_sha256: args.identity.demoSha256,
    parser: args.identity.parser,
    v2: {
      producer_gate_status: args.evidence.v2ProducerGateStatus,
      producer_reasons: args.evidence.v2ProducerReasons,
      contract_digest: args.evidence.v2ContractDigest,
      final_contract_produced: false,
    },
    gates,
    semantic_checks: [...args.semantic],
    limitations,
    excluded_metrics: verdict === "BLOCKED" ? [] : excludedMetricsFor(limitations),
    physical: {
      artifact_root_digest: args.physical.artifactRootDigest,
      reconciliation_digest: args.physical.reconciliationDigest,
    },
    blocked_reasons: uniqueBlocked,
  };
  return { ...body, decision_digest: admissionDecisionDigestV3(body) };
}

export function admissionDecisionDigestV3(
  decision: Omit<AdmissionDecisionV3, "decision_digest"> | AdmissionDecisionV3,
): string {
  const body = Object.fromEntries(
    Object.entries(decision).filter(([key]) => key !== "decision_digest"),
  );
  return rawArtifactSha256(stableRawArtifactJson(body));
}

/** Persistence-boundary check: the decision is admissible and bound to its digest. */
export function admissionDecisionV3Reasons(decision: unknown): string[] {
  const value = rec(decision);
  const reasons: string[] = [];
  if (value["contract"] !== ADMISSION_V3_CONTRACT) reasons.push("contract_invalid");
  if (value["ruleset_version"] !== ADMISSION_V3_RULESET_VERSION) reasons.push("ruleset_invalid");
  if (value["verdict"] !== "LIMITED" && value["verdict"] !== "PASS")
    reasons.push("verdict_not_admissible");
  if (arr(value["blocked_reasons"]).length) reasons.push("blocked_reasons_present");
  const gates = arr(value["gates"]).map(rec);
  if (
    !gates.length ||
    gates.some((gate) => gate["decision"] !== "PASS" && gate["decision"] !== "LIMITED")
  )
    reasons.push("gate_not_admissible");
  for (const id of arr(value["limitations"]).map(String))
    if (!LIMITATIONS_V3[id]) reasons.push(`unknown_limitation:${id}`);
  if (rec(value["v2"])["final_contract_produced"] !== false) reasons.push("v2_final_claimed");
  try {
    const expected = excludedMetricsFor(arr(value["limitations"]).map(String));
    if (stableRawArtifactJson(expected) !== stableRawArtifactJson(value["excluded_metrics"]))
      reasons.push("excluded_metrics_mismatch");
  } catch {
    reasons.push("excluded_metrics_mismatch");
  }
  if (
    typeof value["decision_digest"] !== "string" ||
    value["decision_digest"] !== admissionDecisionDigestV3(value as unknown as AdmissionDecisionV3)
  )
    reasons.push("decision_digest_invalid");
  return reasons.sort();
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADMISSION_V3_CONTRACT,
  LIMITATIONS_V3,
  METRIC_DATA_DEPENDENCIES_V3,
  admissionDecisionV3Reasons,
  classifyForensicV2ForAdmissionV3,
  decideAdmissionV3,
  excludedMetricsFor,
  verifyCanonicalSemanticsV3,
  type SemanticBundleV3,
} from "@/lib/pipeline/admissionV3";
import {
  rawArtifactSha256,
  stableRawArtifactJson,
  validateRawForensicContractV2,
} from "@/lib/pipeline/rawArtifactContract";

/**
 * Derived from the forensic contract v2 the worker produced for the public CI fixture
 * demo (LaihoE/demoparser test_demo.dem @4131a4f, sha256 84a1a419…) with the producer
 * digest fix: real gate verdicts, reasons, reconciliation and tick audit. Only the large
 * inventories were trimmed; the contract is re-signed with the app's canonical JSON.
 */
const FIXTURE = resolve(__dirname, "fixtures/forensicV2ProducerPublicFixture.json");
type Rec = Record<string, unknown>;
const load = (): Rec => JSON.parse(readFileSync(FIXTURE, "utf8")) as Rec;

function sign(contract: Rec): Rec {
  const unsigned = Object.fromEntries(
    Object.entries(contract).filter(
      ([key]) =>
        key !== "deterministic_digest" &&
        key !== "unsigned_contract_digest" &&
        key !== "final_contract_digest",
    ),
  );
  const digest = rawArtifactSha256(stableRawArtifactJson(unsigned));
  return { ...contract, deterministic_digest: digest, unsigned_contract_digest: digest };
}

function gate(contract: Rec, name: string): Rec {
  const found = (contract["gates"] as Rec[]).find((item) => item["gate"] === name);
  if (!found) throw new Error(name);
  return found;
}

function classify(contract: Rec) {
  return classifyForensicV2ForAdmissionV3(
    contract,
    validateRawForensicContractV2(contract, "producer"),
  );
}

const HEX = (c: string) => c.repeat(64);

function bundle(overrides: Partial<SemanticBundleV3> = {}): SemanticBundleV3 {
  return {
    match: { map: "de_mirage", scoreTeamA: 2, scoreTeamB: 1, winnerTeam: "team_a", roundCount: 3 },
    participants: [
      { participantKey: "a1", team: "team_a" },
      { participantKey: "a2", team: "team_a" },
      { participantKey: "b1", team: "team_b" },
      { participantKey: "b2", team: "team_b" },
    ],
    rounds: [
      {
        roundNumber: 1,
        startTick: 100,
        endTick: 200,
        winningTeam: "team_a",
        bombPlanted: true,
        bombDefused: true,
        bombExploded: false,
      },
      {
        roundNumber: 2,
        startTick: 300,
        endTick: 400,
        winningTeam: "team_b",
        bombPlanted: true,
        bombDefused: false,
        bombExploded: true,
      },
      {
        roundNumber: 3,
        startTick: 500,
        endTick: 600,
        winningTeam: "team_a",
        bombPlanted: false,
        bombDefused: false,
        bombExploded: false,
      },
    ],
    events: [
      {
        roundNumber: 1,
        type: "damage",
        tick: 110,
        actorParticipantKey: "a1",
        victimParticipantKey: "b1",
        damage: 100,
      },
      {
        roundNumber: 1,
        type: "kill",
        tick: 110,
        actorParticipantKey: "a1",
        victimParticipantKey: "b1",
        damage: null,
      },
      {
        roundNumber: 1,
        type: "bomb_plant",
        tick: 150,
        actorParticipantKey: "b2",
        victimParticipantKey: null,
        damage: null,
      },
      {
        roundNumber: 1,
        type: "bomb_defuse",
        tick: 190,
        actorParticipantKey: "a2",
        victimParticipantKey: null,
        damage: null,
      },
      {
        roundNumber: 2,
        type: "bomb_plant",
        tick: 350,
        actorParticipantKey: "b1",
        victimParticipantKey: null,
        damage: null,
      },
      {
        roundNumber: 2,
        type: "bomb_explode",
        tick: 390,
        actorParticipantKey: null,
        victimParticipantKey: null,
        damage: null,
      },
      {
        roundNumber: 2,
        type: "kill",
        tick: 320,
        actorParticipantKey: null,
        victimParticipantKey: "a2",
        damage: null,
      },
      {
        roundNumber: 3,
        type: "kill",
        tick: 510,
        actorParticipantKey: "a2",
        victimParticipantKey: "b2",
        damage: null,
      },
    ],
    ...overrides,
  };
}

const IDENTITY = {
  jobId: "406df30a-f869-4f1d-b2c0-f0b00a11067a",
  uploadId: "31f31c0a-6be9-48d4-9ca3-0f8987e45575",
  attemptNumber: 3,
  artifactId: "00000000-0000-4000-8000-000000000001",
  demoSha256: HEX("1"),
  parser: { name: "demoparser2", version: "0.42.0", revision: "git:x", build_revision: "git:x" },
};

describe("admission v3 — evidence classification of the real producer contract", () => {
  it("keeps v2 BLOCKED and classifies exactly the three structural limitations", () => {
    const contract = load();
    const v2 = validateRawForensicContractV2(contract, "producer");
    // v2 is not reinterpreted: its own verdict is unchanged.
    expect(v2).toContain("forensic_v2_producer_decision_invalid");
    expect(contract["producer_gate_status"]).toBe("BLOCKED");
    expect(v2.some((reason) => reason.includes("digest"))).toBe(false);

    const before = JSON.stringify(contract);
    const result = classifyForensicV2ForAdmissionV3(contract, v2);
    expect(JSON.stringify(contract)).toBe(before); // never mutated
    expect(result.contract).toBe(ADMISSION_V3_CONTRACT);
    expect(result.status).toBe("ELIGIBLE");
    expect(result.v2ProducerReasons).toEqual([...v2].sort());
    expect(result.limitations).toEqual([
      "L01-CAPABILITY-SURFACE-UNENUMERABLE",
      "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
      "L03-USERCMD-UNAVAILABLE",
    ]);
    expect(result.pendingCanonicalVerification).toEqual([
      "RAW-V2-10-header",
      "RAW-V2-12-rounds",
      "RAW-V2-13-bomb",
      "RAW-V2-14-combat",
      "RAW-V2-16-teams-score",
    ]);
    // UNAVAILABLE is an evidence state, never a PASS.
    for (const item of result.gates.filter((g) => g.limitation)) {
      expect(item.evidence).toBe("UNAVAILABLE");
      expect(item.decision).toBe("LIMITED");
    }
    expect(result.gates.find((g) => g.gate === "RAW-V2-22-physical-reaudit")?.decision).toBe(
      "PENDING_PHYSICAL_REAUDIT",
    );
  });

  it("blocks a tampered contract (digest) even when every gate would be limitable", () => {
    const contract = load();
    (contract["full_tick_audit"] as Rec)["note"] = "tampered";
    const result = classify(contract);
    expect(result.status).toBe("BLOCKED");
    expect(result.blockedReasons).toContain("v3:v2_contract_digest_invalid");
  });

  it("blocks unknown or unmapped fields (RAW-V2-20)", () => {
    const contract = load();
    Object.assign(gate(contract, "RAW-V2-20-mapping-complete"), {
      status: "BLOCKED",
      reasons: ["player_death.future_field"],
    });
    const result = classify(sign(contract));
    expect(result.status).toBe("BLOCKED");
    expect(result.blockedReasons).toContain("v3:RAW-V2-20-mapping-complete:gate_has_no_v3_rule");
  });

  it("blocks an incomplete canonical mapping reported by the v2 validator", () => {
    const contract = load();
    const mappings = contract["mapping_inventory"] as Rec[];
    const canonical = mappings.find((m) => m["status"] === "CANONICAL")!;
    canonical["canonical_field"] = null;
    const result = classify(sign(contract));
    expect(result.status).toBe("BLOCKED");
    expect(
      result.blockedReasons.some((r) => r.includes("forensic_v2_canonical_mapping_missing")),
    ).toBe(true);
  });

  it("blocks attempted events that failed (RAW-V2-04 / RAW-V2-21)", () => {
    for (const name of ["RAW-V2-04-all-events-attempted", "RAW-V2-21-no-parse-failures"]) {
      const contract = load();
      Object.assign(gate(contract, name), { status: "BLOCKED", reasons: ["event:player_hurt"] });
      const result = classify(sign(contract));
      expect(result.status, name).toBe("BLOCKED");
    }
  });

  it("blocks observed tick gaps, overlaps and failed batches — only missing authority is limited", () => {
    const gaps = load();
    Object.assign(gate(gaps, "RAW-V2-07-tick-gaps"), {
      status: "BLOCKED",
      reasons: ["tick_gap_detected"],
    });
    expect(classify(sign(gaps)).status).toBe("BLOCKED");

    const overlaps = load();
    (overlaps["full_tick_audit"] as Rec)["duplicate_tick_count"] = 3;
    expect(classify(sign(overlaps)).status).toBe("BLOCKED");

    const attempted = load();
    (attempted["full_tick_audit"] as Rec)["batches"] = [{ batch: 0, status: "FAIL" }];
    (attempted["full_tick_audit"] as Rec)["batch_count"] = 1;
    const result = classify(sign(attempted));
    expect(result.status).toBe("BLOCKED");
    expect(result.blockedReasons).toContain(
      "v3:RAW-V2-06-tick-batches:tick_failure_not_limited_to_missing_authority",
    );
  });

  it("blocks a capability catalog failure that is not only the unenumerable runtime surface", () => {
    const contract = load();
    Object.assign(contract["capability_reconciliation"] as Rec, {
      unresolved_count: 1,
      unresolved: ["events.something"],
    });
    const result = classify(sign(contract));
    expect(result.status).toBe("BLOCKED");
    expect(result.blockedReasons).toContain(
      "v3:RAW-V2-02-capability-catalog:capability_catalog_failure_not_limited_to_runtime_surface",
    );
  });

  it("does not limit usercmd when the producer claims it is available", () => {
    const contract = load();
    ((contract["semantic_inventories"] as Rec)["usercmd_capability"] as Rec)["coverage"] =
      "AVAILABLE";
    expect(classify(sign(contract)).status).toBe("BLOCKED");
  });

  it("blocks a semantic gate whose failure is not the known 'unproven' reason", () => {
    const contract = load();
    Object.assign(gate(contract, "RAW-V2-12-rounds"), {
      status: "BLOCKED",
      reasons: ["round_score_contradiction"],
    });
    expect(classify(sign(contract)).status).toBe("BLOCKED");
  });

  it("blocks a parser identity mismatch", () => {
    const contract = load();
    Object.assign(gate(contract, "RAW-V2-01-parser-identity"), {
      status: "BLOCKED",
      reasons: ["parser_identity_mismatch"],
    });
    expect(classify(sign(contract)).status).toBe("BLOCKED");
  });
});

describe("admission v3 — semantic re-verification on the canonical bundle", () => {
  const byGate = (b: SemanticBundleV3, header: string | null = "de_mirage") =>
    Object.fromEntries(verifyCanonicalSemanticsV3(b, header).map((c) => [c.gate, c]));

  it("passes a consistent bundle", () => {
    const checks = byGate(bundle());
    for (const name of [
      "RAW-V2-10-header",
      "RAW-V2-12-rounds",
      "RAW-V2-13-bomb",
      "RAW-V2-14-combat",
      "RAW-V2-16-teams-score",
    ])
      expect(checks[name]?.status, name).toBe("PASS");
  });

  it("blocks a header that differs from the sealed RAW header", () => {
    expect(byGate(bundle(), "de_inferno")["RAW-V2-10-header"]?.status).toBe("BLOCKED");
    expect(byGate(bundle(), null)["RAW-V2-10-header"]?.status).toBe("BLOCKED");
  });

  it("blocks an event outside its round and overlapping rounds", () => {
    const outside = bundle();
    outside.events = [...outside.events, { ...outside.events[0]!, tick: 250 }];
    expect(byGate(outside)["RAW-V2-12-rounds"]?.reasons).toContain("event_outside_round_interval");
    const overlap = bundle();
    overlap.rounds = overlap.rounds.map((r) =>
      r.roundNumber === 2 ? { ...r, startTick: 150 } : r,
    );
    expect(byGate(overlap)["RAW-V2-12-rounds"]?.status).toBe("BLOCKED");
  });

  it("blocks a defuse without a prior plant and flags that disagree with events", () => {
    const b = bundle();
    b.events = b.events.filter((e) => !(e.roundNumber === 1 && e.type === "bomb_plant"));
    const check = byGate(b)["RAW-V2-13-bomb"]!;
    expect(check.status).toBe("BLOCKED");
    expect(check.reasons).toContain("bomb_terminal_without_prior_plant");
    expect(check.reasons).toContain("round_bomb_planted_flag_disagrees");
  });

  it("blocks unknown victims and players dying twice in a round", () => {
    const b = bundle();
    b.events = [...b.events, { ...b.events[1]!, tick: 120 }];
    expect(byGate(b)["RAW-V2-14-combat"]?.reasons).toContain("victim_died_twice_in_round");
    const c = bundle();
    c.events = c.events.map((e) => (e.type === "kill" ? { ...e, victimParticipantKey: "zz" } : e));
    expect(byGate(c)["RAW-V2-14-combat"]?.reasons).toContain("kill_victim_unknown");
  });

  it("blocks a score that differs from the round winners and partial team data", () => {
    const wrong = bundle({ match: { ...bundle().match, scoreTeamA: 3 } });
    expect(byGate(wrong)["RAW-V2-16-teams-score"]?.reasons).toContain(
      "score_differs_from_round_winners",
    );
    const partial = bundle();
    partial.rounds = partial.rounds.map((r) => ({
      ...r,
      winningTeam: r.roundNumber === 1 ? "team_a" : null,
    }));
    expect(byGate(partial)["RAW-V2-16-teams-score"]?.status).toBe("BLOCKED");
  });

  it("limits (L04) only the complete absence of team and score data", () => {
    const none = bundle({
      match: {
        map: "de_mirage",
        scoreTeamA: null,
        scoreTeamB: null,
        winnerTeam: null,
        roundCount: 3,
      },
      participants: bundle().participants.map((p) => ({ ...p, team: null })),
      rounds: bundle().rounds.map((r) => ({ ...r, winningTeam: null })),
    });
    const check = byGate(none)["RAW-V2-16-teams-score"]!;
    expect(check.status).toBe("LIMITED");
    expect(check.limitation).toBe("L04-MATCH-RESULT-UNRESOLVED");
    // A single team-tagged participant makes the data partial, hence BLOCKED.
    none.participants = [{ participantKey: "a1", team: "team_a" }, ...none.participants.slice(1)];
    expect(byGate(none)["RAW-V2-16-teams-score"]?.status).toBe("BLOCKED");
  });
});

describe("admission v3 — decision, exclusions and persistence binding", () => {
  const evidence = () => classify(load());

  it("produces a LIMITED, digest-bound, admissible decision that names v2 and excludes nothing it cannot", () => {
    const decision = decideAdmissionV3({
      evidence: evidence(),
      semantic: verifyCanonicalSemanticsV3(bundle(), "de_mirage"),
      identity: IDENTITY,
      physical: { artifactRootDigest: HEX("a"), reconciliationDigest: HEX("b") },
    });
    expect(decision.verdict).toBe("LIMITED");
    expect(decision.v2.final_contract_produced).toBe(false);
    expect(decision.v2.producer_gate_status).toBe("BLOCKED");
    expect(decision.limitations).toHaveLength(3);
    expect(decision.excluded_metrics).toEqual([]);
    expect(decision.gates.every((g) => g.decision === "PASS" || g.decision === "LIMITED")).toBe(
      true,
    );
    expect(admissionDecisionV3Reasons(decision)).toEqual([]);
  });

  it("refuses a decision whose verdict or digest was altered", () => {
    const decision = decideAdmissionV3({
      evidence: evidence(),
      semantic: verifyCanonicalSemanticsV3(bundle(), "de_mirage"),
      identity: IDENTITY,
      physical: { artifactRootDigest: HEX("a"), reconciliationDigest: HEX("b") },
    });
    expect(admissionDecisionV3Reasons({ ...decision, verdict: "PASS" })).toContain(
      "decision_digest_invalid",
    );
    expect(admissionDecisionV3Reasons({ ...decision, excluded_metrics: ["kills"] })).toContain(
      "excluded_metrics_mismatch",
    );
  });

  it("blocks when a canonical verification fails, and that decision is not admissible", () => {
    const b = bundle();
    b.events = b.events.map((e) => (e.type === "kill" ? { ...e, victimParticipantKey: "zz" } : e));
    const decision = decideAdmissionV3({
      evidence: evidence(),
      semantic: verifyCanonicalSemanticsV3(b, "de_mirage"),
      identity: IDENTITY,
      physical: { artifactRootDigest: HEX("a"), reconciliationDigest: HEX("b") },
    });
    expect(decision.verdict).toBe("BLOCKED");
    expect(decision.blocked_reasons).toContain("v3:RAW-V2-14-combat:kill_victim_unknown");
    expect(admissionDecisionV3Reasons(decision)).toContain("verdict_not_admissible");
  });

  it("blocks when the physical re-audit did not run", () => {
    const decision = decideAdmissionV3({
      evidence: evidence(),
      semantic: verifyCanonicalSemanticsV3(bundle(), "de_mirage"),
      identity: IDENTITY,
      physical: { artifactRootDigest: HEX("a"), reconciliationDigest: null },
    });
    expect(decision.verdict).toBe("BLOCKED");
    expect(decision.blocked_reasons).toContain("v3:physical_reaudit_not_run");
  });

  it("adds L04 and excludes exactly the result and score projection columns", () => {
    const none = bundle({
      match: {
        map: "de_mirage",
        scoreTeamA: null,
        scoreTeamB: null,
        winnerTeam: null,
        roundCount: 3,
      },
      participants: bundle().participants.map((p) => ({ ...p, team: null })),
      rounds: bundle().rounds.map((r) => ({ ...r, winningTeam: null })),
    });
    const decision = decideAdmissionV3({
      evidence: evidence(),
      semantic: verifyCanonicalSemanticsV3(none, "de_mirage"),
      identity: IDENTITY,
      physical: { artifactRootDigest: HEX("a"), reconciliationDigest: HEX("b") },
    });
    expect(decision.verdict).toBe("LIMITED");
    expect(decision.limitations).toContain("L04-MATCH-RESULT-UNRESOLVED");
    expect(decision.excluded_metrics).toEqual([
      "matches.result",
      "matches.score_opponent",
      "matches.score_player",
      "matches.team_opponent",
      "matches.team_player",
    ]);
    expect(admissionDecisionV3Reasons(decision)).toEqual([]);
  });
});

describe("admission v3 — metric compatibility matrix", () => {
  const typesSource = readFileSync(
    resolve(__dirname, "../../../integrations/supabase/types.ts"),
    "utf8",
  );

  it("declares the dependencies of every persisted match_metrics column", () => {
    const block = typesSource.slice(typesSource.indexOf("match_metrics: {"));
    const row = block.slice(block.indexOf("Row: {"), block.indexOf("}", block.indexOf("Row: {")));
    const columns = [...row.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]!);
    const persisted = columns.filter(
      (c) => !["id", "match_id", "player_id", "created_at"].includes(c),
    );
    expect(persisted.length).toBeGreaterThan(10);
    expect(Object.keys(METRIC_DATA_DEPENDENCIES_V3).sort()).toEqual([...persisted].sort());
  });

  it("no persisted metric depends on a class the structural limitations forbid", () => {
    expect(
      excludedMetricsFor([
        "L01-CAPABILITY-SURFACE-UNENUMERABLE",
        "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
        "L03-USERCMD-UNAVAILABLE",
      ]),
    ).toEqual([]);
    for (const spec of Object.values(LIMITATIONS_V3)) {
      expect(spec.justification.length).toBeGreaterThan(40);
      expect(spec.forbiddenDataClasses.length).toBeGreaterThan(0);
    }
  });

  it("the metric and feature engines read no usercmd input and no continuous tick stream", () => {
    for (const file of ["../metrics.ts", "../features.ts"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      for (const token of [
        "usercmd",
        "buttons",
        "view_angles",
        "aim_punch",
        "shots_fired",
        "tick_rows",
        "full_tick",
        "position_snapshots",
        "aim_observations",
      ])
        expect(source.includes(token), `${file}:${token}`).toBe(false);
    }
  });
});

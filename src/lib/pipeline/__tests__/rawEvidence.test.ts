import { describe, expect, it } from "vitest";
import {
  assertRawAdmissionApproved,
  assertRawDemoEvidence,
  computeRawEvidenceDigest,
  evaluateRawEvidence,
  runRawForensicAudit,
} from "@/lib/pipeline/rawEvidence";

const evidence = {
  evidence_version: 1,
  manifest: {
    parser_name: "demoparser2",
    parser_version: "0.42.0",
    parser_revision: "git:a",
    contract_version: 1,
    demo_sha256: "a".repeat(64),
    file_size: 1,
    map: null,
    patch_version: null,
    build_number: null,
    demo_version_name: null,
    demo_version_guid: null,
    demo_file_stamp: null,
    server_name: null,
    client_name: null,
    game_directory: null,
    tickrate: null,
    playback_ticks: null,
    playback_time: null,
    playback_frames: null,
    players_count: 0,
    rounds_count: 0,
    events_count: 0,
    event_inventory_success: true,
    event_inventory_count: 0,
    first_tick: null,
    last_tick: null,
    warnings: [],
    partial_parse: false,
    extraction_confidence: null,
    event_inventory: [],
    selected_event_candidates: [],
    parsed_event_tables: [],
    tick_sample_rows: 0,
    event_rows: 0,
    estimated_evidence_bytes: null,
  },
  event_coverage: [],
  raw_events: [],
  raw_player_info: [],
  player_coverage: [],
  tick_coverage: [],
  tick_samples: [],
  grenade_coverage: [],
  grenade_samples: [],
  round_evidence: [],
  economy_coverage: [],
  field_mappings: [],
  gates: [{ gate: "RAW-EVIDENCE-01", status: "FAIL" as const, reasons: ["missing real evidence"] }],
  deterministic_digest: "b".repeat(64),
};

describe("raw evidence contract", () => {
  it("preserves unknown separately from false and zero", () => {
    const value = assertRawDemoEvidence(evidence);
    expect(value.manifest.map).toBeNull();
    expect(value.manifest.partial_parse).toBe(false);
    expect(value.manifest.players_count).toBe(0);
  });
  it("blocks invalid digests and reports gates deterministically", async () => {
    expect(
      (
        await runRawForensicAudit(
          assertRawDemoEvidence({ ...evidence, deterministic_digest: "bad" }),
        )
      ).reasons,
    ).toContain("raw_digest_invalid");
    expect(evaluateRawEvidence(evidence)[0]?.status).toBe("FAIL");
  });
  it("preserves unresolved mappings while blocking canonical admission", async () => {
    const unknown = assertRawDemoEvidence({
      ...evidence,
      field_mappings: [
        {
          raw_field: "event.future_field",
          app_field: null,
          canonical_field: null,
          status: "UNMAPPED_BUT_AVAILABLE",
          reason: null,
        },
      ],
    });
    const unknownDecision = await runRawForensicAudit(unknown);
    expect(unknownDecision.status).toBe("BLOCKED");
    expect(unknownDecision.reasons).toContain("unmapped_but_available:event.future_field");
    expect(() => assertRawAdmissionApproved(unknownDecision)).toThrow("admission denied");

    const unexplained = assertRawDemoEvidence({
      ...evidence,
      field_mappings: [
        {
          raw_field: "player.kills_total",
          app_field: null,
          canonical_field: null,
          status: "RAW_ONLY_INTENTIONAL",
          reason: null,
        },
      ],
    });
    const unexplainedDecision = await runRawForensicAudit(unexplained);
    expect(unexplainedDecision.status).toBe("BLOCKED");
    expect(unexplainedDecision.reasons).toContain("raw_only_reason_missing:player.kills_total");
  });

  it("blocks empty audit evidence instead of treating absence as PASS", async () => {
    const complete = assertRawDemoEvidence({ ...evidence, gates: [] });
    const decision = await runRawForensicAudit(complete);
    expect(decision.status).toBe("BLOCKED");
    expect(decision.auditStatus).toBe("BLOCKED");
    expect(decision.approved).toBe(false);
    expect(decision.reasons).toContain("audit_gates_empty");
    expect(decision.reasons).toContain("audit_mapping_inventory_empty");
    expect(decision.reasons).toContain("audit_inventory_missing");
    expect(decision.forensicInventory["tick_sampling"]).toMatchObject({ coverage: "SAMPLE" });
    expect(() => assertRawAdmissionApproved(decision)).toThrow();
  });

  it("classifies parser mapping failures as FAIL", async () => {
    const failed = assertRawDemoEvidence({
      ...evidence,
      field_mappings: [
        {
          raw_field: "event.bad",
          app_field: null,
          canonical_field: null,
          status: "PARSE_FAILED",
          reason: "safe",
        },
      ],
    });
    expect((await runRawForensicAudit(failed)).status).toBe("FAIL");
  });

  it("keeps unavailable capabilities distinct from parse failures", async () => {
    const unavailable = assertRawDemoEvidence({
      ...evidence,
      gates: [],
      event_coverage: [
        {
          event_name: "future_event",
          available: false,
          parse_attempted: false,
          parse_success: false,
          row_count: null,
          first_tick: null,
          last_tick: null,
          first_round: null,
          last_round: null,
          fields_available: [],
          fields_missing: [],
          error_type: null,
          error_message_safe: null,
          capability_state: "NOT_PRESENT_IN_DEMO",
        },
      ],
    });
    expect((await runRawForensicAudit(unavailable)).status).toBe("BLOCKED");
  });

  it("independently detects a returned event field missing from preserved RAW", async () => {
    const inconsistent = assertRawDemoEvidence({
      ...evidence,
      gates: [{ gate: "RAW-EVIDENCE-01", status: "PASS" as const, reasons: [] }],
      field_mappings: [
        {
          raw_field: "player_death.future",
          app_field: null,
          canonical_field: null,
          status: "MAPPED" as const,
          reason: null,
        },
      ],
      event_coverage: [
        {
          event_name: "player_death",
          available: true,
          parse_attempted: true,
          parse_success: true,
          row_count: 1,
          first_tick: 1,
          last_tick: 1,
          first_round: 1,
          last_round: 1,
          fields_available: ["future"],
          fields_missing: [],
          error_type: null,
          error_message_safe: null,
          capability_state: "PARSED_SUCCESSFULLY" as const,
        },
      ],
      forensic_inventory: Object.fromEntries(
        [
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
        ].map((key) => [key, key === "tick_sampling" ? { coverage: "SAMPLE" } : []]),
      ),
    });
    expect((await runRawForensicAudit(inconsistent)).reasons).toContain(
      "returned_field_not_preserved:player_death.future",
    );
  });

  it("catalogues every required forensic inventory family", async () => {
    const inventoried = assertRawDemoEvidence({
      ...evidence,
      gates: [],
      player_coverage: [
        {
          property: "team_num",
          available: true,
          rows: 1,
          null_percent: 0,
          min: 2,
          max: 2,
          sample: 2,
        },
        { property: "score", available: true, rows: 1, null_percent: 0, min: 4, max: 4, sample: 4 },
      ],
      tick_coverage: [
        { property: "X", available: true, rows: 1, null_percent: 0, min: 0, max: 0, sample: 0 },
        {
          property: "shots_fired",
          available: true,
          rows: 1,
          null_percent: 0,
          min: 0,
          max: 0,
          sample: 0,
        },
      ],
      grenade_coverage: [
        {
          property: "grenade_type",
          available: true,
          rows: 1,
          null_percent: 0,
          min: null,
          max: null,
          sample: "smoke",
        },
      ],
    });
    const inventory = (await runRawForensicAudit(inventoried)).forensicInventory;
    expect(inventory["grenade_inventory"]).toEqual(["grenade_type"]);
    expect(inventory["usercmd_inventory"]).toEqual(["shots_fired"]);
    expect(inventory["teams_inventory"]).toEqual(["team_num"]);
    expect(inventory["score_inventory"]).toEqual(["score"]);
    expect(inventory["movement_inventory"]).toEqual(["X"]);
  });

  it("deduplicates and sorts block reasons deterministically", async () => {
    const blocked = assertRawDemoEvidence({
      ...evidence,
      gates: [
        { gate: "Z", status: "BLOCKED", reasons: [] },
        { gate: "Z", status: "FAIL", reasons: [] },
      ],
    });
    expect((await runRawForensicAudit(blocked)).reasons).toEqual(
      expect.arrayContaining([
        "audit_inventory_missing",
        "audit_mapping_inventory_empty",
        "gate:Z",
        "tick_coverage_mischaracterized",
      ]),
    );
  });

  it("recalculates a stable digest and detects changed RAW content", async () => {
    const unsigned = assertRawDemoEvidence(evidence);
    const digest = await computeRawEvidenceDigest(unsigned);
    const signed = assertRawDemoEvidence({ ...unsigned, deterministic_digest: digest });
    expect((await runRawForensicAudit(signed)).reasons).not.toContain("raw_digest_mismatch");
    const reordered = assertRawDemoEvidence({ ...unsigned, deterministic_digest: digest });
    expect(await computeRawEvidenceDigest(reordered)).toBe(digest);
    const changed = assertRawDemoEvidence({ ...signed, raw_player_info: [{ name: "changed" }] });
    expect((await runRawForensicAudit(changed)).reasons).toContain("raw_digest_mismatch");
  });
});

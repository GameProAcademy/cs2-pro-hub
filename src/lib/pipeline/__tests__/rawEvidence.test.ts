import { describe, expect, it } from "vitest";
import {
  assertRawAdmissionApproved,
  assertRawDemoEvidence,
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
  it("rejects invalid digests and reports gates deterministically", () => {
    expect(() => assertRawDemoEvidence({ ...evidence, deterministic_digest: "bad" })).toThrow();
    expect(evaluateRawEvidence(evidence)[0]?.status).toBe("FAIL");
  });
  it("preserves unresolved mappings while blocking canonical admission", () => {
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
    const unknownDecision = runRawForensicAudit(unknown);
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
    expect(runRawForensicAudit(unexplained).status).toBe("BLOCKED");
  });

  it("approves only complete evidence and inventories its sampling semantics", () => {
    const complete = assertRawDemoEvidence({ ...evidence, gates: [] });
    const decision = runRawForensicAudit(complete);
    expect(decision.status).toBe("PASS");
    expect(decision.approved).toBe(true);
    expect(decision.forensicInventory["tick_sampling"]).toMatchObject({ coverage: "SAMPLE" });
    expect(() => assertRawAdmissionApproved(decision)).not.toThrow();
  });

  it("classifies parser mapping failures as FAIL", () => {
    const failed = assertRawDemoEvidence({
      ...evidence,
      field_mappings: [{ raw_field: "event.bad", app_field: null, canonical_field: null, status: "PARSE_FAILED", reason: "safe" }],
    });
    expect(runRawForensicAudit(failed).status).toBe("FAIL");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ME, syntheticParserOutput } from "@/lib/pipeline/__tests__/fixture";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { computeRawEvidenceDigest, runRawForensicAudit } from "@/lib/pipeline/rawEvidence";
import { demoToCanonicalBundle } from "../adapters/demo.adapter";

const maybeSingle = vi.fn();
const rpc = vi.fn();
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle,
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(() => query), rpc },
}));

const { CanonicalPersistenceError, persistCanonicalObservation } = await import(
  "../canonical.persistence.server"
);

const digest = "b".repeat(64);
const requiredInventory = Object.fromEntries([
  "header_inventory", "player_info_inventory", "game_state_inventory", "round_inventory",
  "bomb_inventory", "damage_inventory", "death_inventory", "weapon_inventory",
  "grenade_inventory", "usercmd_inventory", "teams_inventory", "score_inventory",
  "aggregate_inventory", "movement_inventory", "all_event_inventory", "selected_event_extraction",
  "actually_parsed_events", "event_returned_field_inventory", "event_preserved_field_inventory",
  "player_info_returned_fields", "player_info_preserved_fields", "usercmd_capability",
  "mapping_inventory", "tick_sampling",
].map((key) => [key, key === "tick_sampling" ? { coverage: "SAMPLE" } : []]));
const auditEvidence = {
  evidence_version: 1,
  manifest: {
    parser_name: "demoparser2", parser_version: "0.42.0", parser_revision: "git:a",
    contract_version: 1, demo_sha256: "a".repeat(64), file_size: 1, map: null,
    patch_version: null, build_number: null, demo_version_name: null, demo_version_guid: null,
    demo_file_stamp: null, server_name: null, client_name: null, game_directory: null,
    tickrate: null, playback_ticks: 1, playback_time: null, playback_frames: null,
    players_count: 0, rounds_count: 0, events_count: 0, event_inventory_success: true,
    event_inventory_count: 0, first_tick: null, last_tick: null, warnings: [], partial_parse: false,
    extraction_confidence: null, event_inventory: [], selected_event_candidates: [],
    parsed_event_tables: [], tick_sample_rows: 0, event_rows: 0, estimated_evidence_bytes: 1,
    tick_sampling: { coverage: "SAMPLE" as const, limit: 1, strategy: "test", truncated: false, full_extraction: false as const },
  },
  event_coverage: [], raw_events: [], raw_player_info: [], player_coverage: [], tick_coverage: [],
  tick_samples: [], grenade_coverage: [], grenade_samples: [], round_evidence: [], economy_coverage: [],
  field_mappings: [{ raw_field: "header.map_name", app_field: "header.map", canonical_field: "match_maps.map", status: "MAPPED" as const, reason: null }],
  gates: [{ gate: "RAW-EVIDENCE-01", status: "PASS" as const, reasons: [] }],
  forensic_inventory: requiredInventory,
  deterministic_digest: digest,
};
auditEvidence.deterministic_digest = await computeRawEvidenceDigest(auditEvidence);
const auditVersion = (await runRawForensicAudit(auditEvidence)).auditVersion;
const bundle = demoToCanonicalBundle({
  parsed: normalizeParserOutput(syntheticParserOutput),
  fingerprint: digest,
  targetSteamId: ME,
  internalPlayerId: "player-1",
  fetchedAt: "2026-01-02T03:04:05.000Z",
});

describe("Canonical RAW admission defense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a direct demo persistence call without explicit approval", async () => {
    await expect(persistCanonicalObservation({ bundle, uploadId: "upload-1" })).rejects.toMatchObject({
      code: "RAW_ADMISSION_REQUIRED",
    } satisfies Partial<InstanceType<typeof CanonicalPersistenceError>>);
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects when persisted RAW evidence is blocked", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        raw_status: "BLOCKED",
        approved_for_canonical: false,
        audit_version: 1,
        deterministic_digest: auditEvidence.deterministic_digest,
        audited_evidence_digest: auditEvidence.deterministic_digest,
      },
      error: null,
    });
    await expect(
      persistCanonicalObservation({
        bundle,
        uploadId: "upload-1",
        rawApproval: { approved: true, auditStatus: "APPROVED", auditVersion, evidenceDigest: auditEvidence.deterministic_digest },
      }),
    ).rejects.toMatchObject({ code: "RAW_ADMISSION_REQUIRED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows Canonical only when persisted approval, version, and digest match", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        ...auditEvidence,
        raw_status: "PASS",
        raw_audit_status: "APPROVED",
        approved_for_canonical: true,
        audit_version: auditVersion,
        deterministic_digest: auditEvidence.deterministic_digest,
        audited_evidence_digest: auditEvidence.deterministic_digest,
      },
      error: null,
    });
    rpc.mockResolvedValue({
      data: {
        match_id: "match-1",
        series_id: null,
        match_source_id: "source-1",
        created: true,
      },
      error: null,
    });
    await expect(
      persistCanonicalObservation({
        bundle,
        uploadId: "upload-1",
        rawApproval: { approved: true, auditStatus: "APPROVED", auditVersion, evidenceDigest: auditEvidence.deterministic_digest },
      }),
    ).resolves.toMatchObject({ matchId: "match-1", matchSourceId: "source-1" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
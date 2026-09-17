import { describe, expect, it } from "vitest";

import { PipelineError } from "@/lib/pipeline/errors";
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { canonicalBundleToRpcPayload } from "@/lib/canonical/canonical.persistence.server";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { assertHotDemoPayload, hotToRawParserOutput } from "@/lib/pipeline/rawArtifact.server";
import {
  DURABLE_HOT_HARD_MAX_BYTES,
  HOT_DEMO_LIMITS,
  type HotDemoPayloadV1,
  type HotSectionQuality,
} from "@/lib/pipeline/types";

function validHot(): HotDemoPayloadV1 {
  const rows: Record<string, unknown[]> = {
    players: [],
    rounds: [],
    combat_events: [],
    utility_events: [],
    objective_events: [],
    aim_observations: [],
    position_snapshots: [],
    economy_snapshots: [],
    warnings: [],
  };
  const limits: Record<string, number> = {
    players: HOT_DEMO_LIMITS.players,
    rounds: HOT_DEMO_LIMITS.rounds,
    combat_events: HOT_DEMO_LIMITS.combatEvents,
    utility_events: HOT_DEMO_LIMITS.utilityEvents,
    objective_events: HOT_DEMO_LIMITS.objectiveEvents,
    aim_observations: HOT_DEMO_LIMITS.aimObservations,
    position_snapshots: HOT_DEMO_LIMITS.positionSnapshots,
    economy_snapshots: HOT_DEMO_LIMITS.economySnapshots,
    warnings: HOT_DEMO_LIMITS.warnings,
  };
  const sections: Record<string, HotSectionQuality> = Object.fromEntries(
    Object.keys(rows).map((name) => [
      name,
      {
        status: ["aim_observations", "position_snapshots", "economy_snapshots"].includes(name)
          ? ("unavailable" as const)
          : ("complete" as const),
        observed_rows: 0,
        included_rows: 0,
        limit: limits[name] ?? 0,
        overflow_rows: 0,
      },
    ]),
  );
  return {
    schema_version: 1,
    parser: {
      name: "demoparser2",
      version: "0.42.0",
      revision: "git:40ae4977e174f9a21b1394fb047b53fba2505e8b",
    },
    contract_version: 1,
    demo: { sha256: "a".repeat(64), upload_id: "upload" },
    header: {},
    players: [],
    rounds: [],
    combat_events: [],
    utility_events: [],
    objective_events: [],
    aim_observations: [],
    position_snapshots: [],
    economy_snapshots: [],
    warnings: [],
    quality: { partial: true, limited_sections: [], sections, unclassified_event_rows: 0 },
    provenance: { source: "demo", raw_artifact_required: true },
  };
}

function expectInvalid(value: unknown) {
  expect(() => assertHotDemoPayload(value)).toThrow(PipelineError);
}

describe("durable HOT contract", () => {
  it("accepts declared unclassified events without copying them into HOT", () => {
    const hot = validHot();
    hot.quality.unclassified_event_rows = 3;
    expect(assertHotDemoPayload(hot).quality.unclassified_event_rows).toBe(3);
    expect(hot.combat_events).toEqual([]);
  });

  it("accepts explicitly unavailable AIM, position and economy sections", () => {
    expect(assertHotDemoPayload(validHot()).quality.partial).toBe(true);
  });

  it("accepts implemented semantic observations without mixing them into canonical events", () => {
    const hot = validHot();
    hot.aim_observations = [{ player: "76561198000000001", tick: 10, yaw: 45 }];
    const quality = hot.quality.sections["aim_observations"];
    if (!quality) throw new Error("missing aim quality fixture");
    Object.assign(quality, { status: "complete", observed_rows: 1, included_rows: 1 });
    expect(assertHotDemoPayload(hot).aim_observations).toHaveLength(1);
  });

  it("preserves semantic observations through normalization and canonical persistence payload", () => {
    const hot = validHot();
    hot.players = [{ steam_id: "76561198000000001", name: "Player" }];
    hot.rounds = [{ number: 1 }];
    hot.aim_observations = [{ player: "76561198000000001", tick: 10, yaw: 45 }];
    hot.position_snapshots = [{ player: "76561198000000001", tick: 10, x: 12, y: 24, z: 36 }];
    hot.economy_snapshots = [{ player: "76561198000000001", tick: 10, balance: 800 }];
    for (const name of [
      "players",
      "rounds",
      "aim_observations",
      "position_snapshots",
      "economy_snapshots",
    ] as const) {
      const quality = hot.quality.sections[name];
      if (!quality) throw new Error(`missing ${name} quality fixture`);
      Object.assign(quality, {
        status: "complete",
        observed_rows: hot[name].length,
        included_rows: hot[name].length,
      });
    }
    hot.quality.partial = false;

    const validated = assertHotDemoPayload(hot);
    const raw = hotToRawParserOutput(validated);
    const normalized = normalizeParserOutput(raw);
    const bundle = demoToCanonicalBundle({ parsed: normalized, fingerprint: hot.demo.sha256 });
    const payload = canonicalBundleToRpcPayload(bundle) as typeof bundle;

    expect(raw.hot_semantic_data?.aim_observations).toEqual(hot.aim_observations);
    expect(normalized.hotSemanticData?.position_snapshots).toEqual(hot.position_snapshots);
    expect(payload.observation.metadata["hot_semantic_data"]).toEqual({
      schema_version: 1,
      aim_observations: hot.aim_observations,
      position_snapshots: hot.position_snapshots,
      economy_snapshots: hot.economy_snapshots,
      quality: {
        aim_observations: hot.quality.sections["aim_observations"],
        position_snapshots: hot.quality.sections["position_snapshots"],
        economy_snapshots: hot.quality.sections["economy_snapshots"],
      },
    });
    expect(payload.events).toEqual([]);
  });

  it("rejects silent overflow", () => {
    const hot = validHot();
    hot.players = [{ steam_id: "1" }];
    const playersQuality = hot.quality.sections["players"];
    if (!playersQuality) throw new Error("missing players quality fixture");
    Object.assign(playersQuality, { observed_rows: 2, included_rows: 1, overflow_rows: 1 });
    expectInvalid(hot);
  });

  it.each([
    "raw_events",
    "grenade_samples",
    "tick_samples",
    "forensic_inventory",
    "raw_player_info",
  ])("rejects forbidden RAW field %s", (field) => expectInvalid({ ...validHot(), [field]: [] }));

  it("rejects an oversized HOT object even outside the HTTP boundary", () => {
    const hot = validHot();
    hot.warnings = ["x".repeat(DURABLE_HOT_HARD_MAX_BYTES)];
    expect(() => assertHotDemoPayload(hot)).toThrowError(
      expect.objectContaining({
        code: "PARSER_PAYLOAD_TOO_LARGE",
      }),
    );
  });
});

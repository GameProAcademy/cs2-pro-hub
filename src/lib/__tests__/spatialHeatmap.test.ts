/**
 * PM1 / 4.2.2 — radar transform and spatial heatmap read model (pure).
 * Mandatory negative cases (PM1 §12): null / missing / out-of-bounds coordinates, map without a
 * validated transform, missing side, unattributed event, duplicate event, incomplete round,
 * invalid tick, partial coverage, zero denominator, large match, another user's events.
 */
import { describe, expect, it } from "vitest";

import type { PlayerRound } from "@/lib/roundContext";
import {
  HEATMAP_MAX_POINTS,
  HEATMAP_MIN_EVENTS,
  LAYER_SEMANTICS,
  NOT_MEASURED_LAYERS,
  buildHeatmap,
  type HeatmapEventRow,
  type HeatmapFilters,
  type HeatmapMatchInput,
} from "@/lib/spatial/heatmap";
import {
  MAP_OVERVIEWS,
  RADAR_SIZE,
  mapSupport,
  normalizeMapName,
  readWorldPosition,
  worldToRadar,
} from "@/lib/spatial/maps";

const dust2 = MAP_OVERVIEWS["de_dust2"]!;
/** World point for a radar pixel on dust2 (inverse of the documented transform). */
const w = (rx: number, ry: number, z = 0) => ({
  x: rx * dust2.scale + dust2.posX,
  y: dust2.posY - ry * dust2.scale,
  z,
});

describe("radar transform (radar-transform-v1)", () => {
  it("every overview cites its source file with a full SHA-256 and has a positive scale", () => {
    for (const o of Object.values(MAP_OVERVIEWS)) {
      expect(o.sourcePath).toBe(`resource/overviews/${o.map}.txt`);
      expect(o.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(o.scale).toBeGreaterThan(0);
    }
  });

  it("dust2 reference points from the authorized benchmark demo land where the map has them", () => {
    // A real death-tick attacker position from the benchmark demo (round 1, tick 15626).
    const real = worldToRadar(dust2, { x: -344.545654296875, y: 1158.40087890625, z: -88.43 });
    expect(real.ok && [Math.round(real.point.x), Math.round(real.point.y)]).toEqual([484, 473]);
    // Freeze-end spawn means and bomb-plant clusters measured on that demo (docs/reference/SPATIAL_HEATMAP.md).
    const tSpawn = worldToRadar(dust2, w(380, 915));
    const ctSpawn = worldToRadar(dust2, w(621, 187));
    const siteLeft = worldToRadar(dust2, w(250, 153));
    const siteRight = worldToRadar(dust2, w(790, 163));
    for (const r of [tSpawn, ctSpawn, siteLeft, siteRight]) expect(r.ok).toBe(true);
    if (tSpawn.ok && ctSpawn.ok && siteLeft.ok && siteRight.ok) {
      expect(ctSpawn.point.y).toBeLessThan(tSpawn.point.y); // north is up: no vertical flip
      expect(siteLeft.point.x).toBeLessThan(siteRight.point.x); // no horizontal mirror
    }
  });

  it("outside the overview image is OUT_OF_BOUNDS, never clamped", () => {
    expect(worldToRadar(dust2, w(-1, 10))).toEqual({ ok: false, reason: "OUT_OF_BOUNDS" });
    expect(worldToRadar(dust2, w(10, RADAR_SIZE + 1))).toEqual({
      ok: false,
      reason: "OUT_OF_BOUNDS",
    });
  });

  it("splits levels on maps with vertical sections by the lower section's AltitudeMax", () => {
    const nuke = MAP_OVERVIEWS["de_nuke"]!;
    const level = (z: number) => {
      const r = worldToRadar(nuke, { x: nuke.posX + 500, y: nuke.posY - 500, z });
      return r.ok ? r.point.level : r.reason;
    };
    expect(level(-600)).toBe("lower");
    expect(level(-400)).toBe("default");
  });

  it("only maps validated against real positions are SUPPORTED", () => {
    expect(mapSupport("de_dust2").status).toBe("SUPPORTED");
    expect(mapSupport("DE_DUST2").status).toBe("SUPPORTED");
    expect(mapSupport("workshop/123/de_dust2").status).toBe("SUPPORTED");
    expect(mapSupport("de_mirage").status).toBe("NOT_VALIDATED");
    expect(mapSupport("de_unknown").status).toBe("UNKNOWN_MAP");
    expect(mapSupport(null).status).toBe("UNKNOWN_MAP");
    expect(normalizeMapName("de_dust2; drop table")).toBeNull();
  });
});

describe("readWorldPosition — absence is never (0,0)", () => {
  it("rejects missing, invalid and default-filled positions with a reason", () => {
    expect(readWorldPosition(null)).toEqual({ ok: false, reason: "MISSING" });
    expect(readWorldPosition(undefined)).toEqual({ ok: false, reason: "MISSING" });
    expect(readWorldPosition({ x: 1, y: 2 })).toEqual({ ok: false, reason: "MISSING" });
    expect(readWorldPosition({ x: Number.NaN, y: 1, z: 1 })).toEqual({
      ok: false,
      reason: "INVALID",
    });
    expect(readWorldPosition({ x: "1", y: 1, z: 1 })).toEqual({ ok: false, reason: "INVALID" });
    expect(readWorldPosition([1, 2, 3])).toEqual({ ok: false, reason: "INVALID" });
    expect(readWorldPosition({ x: 0, y: 0, z: 0 })).toEqual({
      ok: false,
      reason: "SUSPECT_ORIGIN",
    });
  });
  it("keeps a real coordinate that happens to be zero on one axis", () => {
    expect(readWorldPosition({ x: 0, y: 12.5, z: -3 })).toEqual({
      ok: true,
      position: { x: 0, y: 12.5, z: -3 },
    });
  });
});

const ME = "76561198000000001";
const OPP = "76561198000000002";
const OTHER_USER = "76561198000000099";
let seq = 0;
const kill = (o: Partial<HeatmapEventRow> & { round: number }): HeatmapEventRow => ({
  id: `e${++seq}`,
  matchId: "m1",
  tick: 1000 + seq,
  type: "kill",
  actor: OPP,
  victim: ME,
  weapon: "ak47",
  headshot: false,
  data: {},
  ...o,
});
const rounds = (n: number, side: (r: number) => PlayerRound["side"]): PlayerRound[] =>
  Array.from({ length: n }, (_, i) => ({
    round: i + 1,
    side: side(i + 1),
    outcome: "UNKNOWN",
    kills: 0,
    deaths: 0,
    damage: 0,
  }));
const match = (
  events: HeatmapEventRow[],
  o: Partial<HeatmapMatchInput> = {},
): HeatmapMatchInput => ({
  matchId: "m1",
  map: "de_dust2",
  participantKey: ME,
  rounds: rounds(24, (r) => (r <= 12 ? "T" : "CT")),
  events,
  ...o,
});
const F: HeatmapFilters = { map: "de_dust2", layer: "DEATHS", side: "ALL", level: "default" };

describe("layers: one documented position each, never mixed", () => {
  it("DEATHS uses the victim position, KILLS the attacker position", () => {
    const ev = [
      kill({ round: 1, data: { victim_position: w(100, 100), position: w(900, 900) } }),
      kill({
        round: 2,
        actor: ME,
        victim: OPP,
        data: { victim_position: w(500, 500), position: w(200, 800) },
      }),
    ];
    const deaths = buildHeatmap([match(ev)], F);
    expect(deaths.points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[100, 100]]);
    expect(deaths.semantics).toEqual(LAYER_SEMANTICS.DEATHS);
    const kills = buildHeatmap([match(ev)], { ...F, layer: "KILLS" });
    expect(kills.points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[200, 800]]);
    expect(kills.semantics.field).toBe("round_events.data.position");
  });

  it("presence, routes, exposure, damage and utility positions are declared NOT measured", () => {
    const layers = NOT_MEASURED_LAYERS.map((l) => l.layer);
    expect(layers).toEqual(
      expect.arrayContaining([
        "PRESENCE",
        "ROUTES",
        "EXPOSURE_TIME",
        "DAMAGE_DEALT",
        "DAMAGE_RECEIVED",
        "UTILITY",
      ]),
    );
    expect(buildHeatmap([match([])], F).notMeasured).toBe(NOT_MEASURED_LAYERS);
  });

  it("another player's deaths and kills never enter the caller's layers", () => {
    const ev = [
      kill({
        round: 1,
        actor: OPP,
        victim: OTHER_USER,
        data: { victim_position: w(1, 1), position: w(2, 2) },
      }),
    ];
    expect(buildHeatmap([match(ev)], F).points).toEqual([]);
    expect(buildHeatmap([match(ev)], { ...F, layer: "KILLS" }).points).toEqual([]);
  });

  it("an event without author or victim is not attributed to the caller", () => {
    const ev = [kill({ round: 1, actor: null, victim: null, data: { victim_position: w(1, 1) } })];
    const r = buildHeatmap([match(ev)], F);
    expect(r.events.status).toBe("NOT_OBSERVED");
  });
});

describe("coverage and status (null ≠ 0)", () => {
  it("no eligible event is NOT_OBSERVED with a null value, not a zero", () => {
    const r = buildHeatmap([match([])], F);
    expect(r.events).toMatchObject({ status: "NOT_OBSERVED", value: null });
    expect(r.cells).toEqual([]);
  });

  it("eligible events without positions (parser before R5.8.24) are UNAVAILABLE and listed", () => {
    const r = buildHeatmap([match([kill({ round: 1 }), kill({ round: 2 })])], F);
    expect(r.events).toMatchObject({
      status: "UNAVAILABLE",
      value: null,
      coverage: { measured: 0, eligible: 2 },
    });
    expect(r.excluded).toEqual({ MISSING: 2 });
    expect(r.points).toEqual([]);
  });

  it("partial coverage is PARTIAL with N and denominator, and excluded reasons", () => {
    const ev = [
      kill({ round: 1, data: { victim_position: w(100, 100) } }),
      kill({ round: 2, data: { victim_position: w(-5, 100) } }),
      kill({ round: 3, data: { victim_position: { x: 0, y: 0, z: 0 } } }),
      kill({ round: 4, data: { victim_position: null } }),
      kill({ round: 5, data: { victim_position: { x: "a", y: 1, z: 1 } } }),
    ];
    const r = buildHeatmap([match(ev)], F);
    expect(r.events).toMatchObject({
      status: "PARTIAL",
      value: 1,
      coverage: { measured: 1, eligible: 5 },
    });
    expect(r.excluded).toEqual({ OUT_OF_BOUNDS: 1, SUSPECT_ORIGIN: 1, MISSING: 1, INVALID: 1 });
  });

  it("full coverage is OBSERVED; a duplicate persisted event counts once", () => {
    const e = kill({ round: 1, data: { victim_position: w(10, 10) } });
    const r = buildHeatmap([match([e, { ...e }])], F);
    expect(r.events).toMatchObject({
      status: "OBSERVED",
      value: 1,
      coverage: { measured: 1, eligible: 1 },
    });
  });

  it("an event without a round (incomplete round / invalid reference) is not plotted", () => {
    const r = buildHeatmap(
      [match([{ ...kill({ round: 1, data: { victim_position: w(10, 10) } }), round: null }])],
      F,
    );
    expect(r.events.status).toBe("NOT_OBSERVED");
  });

  it("an invalid tick is kept as null in the drill-down, never as 0", () => {
    const r = buildHeatmap(
      [match([kill({ round: 1, tick: null, data: { victim_position: w(10, 10) } })])],
      F,
    );
    expect(r.points[0]!.tick).toBeNull();
  });

  it("per-round rate is INSUFFICIENT_SAMPLE below the minimum and DERIVED above it", () => {
    const few = buildHeatmap(
      [match([kill({ round: 1, data: { victim_position: w(10, 10) } })])],
      F,
    );
    expect(few.perRound).toMatchObject({ status: "INSUFFICIENT_SAMPLE", value: null });
    const many = Array.from({ length: HEATMAP_MIN_EVENTS }, (_, i) =>
      kill({ round: i + 1, data: { victim_position: w(10 + i, 10) } }),
    );
    const r = buildHeatmap([match(many)], F);
    expect(r.perRound).toMatchObject({
      status: "DERIVED",
      value: Math.round((10 / 24) * 100) / 100,
      sample_size: { n: 24, unit: "rounds" },
    });
  });

  it("zero rounds (denominator zero) never yields a number", () => {
    const many = Array.from({ length: HEATMAP_MIN_EVENTS }, (_, i) =>
      kill({ round: i + 1, data: { victim_position: w(10 + i, 10) } }),
    );
    const r = buildHeatmap([match(many, { rounds: [] })], F);
    expect(r.rounds).toBe(0);
    expect(r.perRound.value).toBeNull();
  });
});

describe("filters", () => {
  const ev = [
    kill({ round: 1, data: { victim_position: w(10, 10) } }), // T
    kill({ round: 13, data: { victim_position: w(20, 20) }, weapon: "awp" }), // CT
    kill({ round: 30, data: { victim_position: w(30, 30) } }), // round without side
  ];
  it("CT/T use the caller's side in that round; unknown side is excluded and counted", () => {
    const t = buildHeatmap([match(ev)], { ...F, side: "T" });
    expect(t.points.map((p) => p.round)).toEqual([1]);
    expect(t.excluded).toEqual({ SIDE_UNKNOWN: 1 });
    expect(t.rounds).toBe(12);
    const ct = buildHeatmap([match(ev)], { ...F, side: "CT" });
    expect(ct.points.map((p) => p.round)).toEqual([13]);
    const all = buildHeatmap([match(ev)], F);
    expect(all.points.map((p) => [p.round, p.side])).toEqual([
      [1, "T"],
      [13, "CT"],
      [30, "UNKNOWN"],
    ]);
  });

  it("weapon and match filters", () => {
    expect(buildHeatmap([match(ev)], { ...F, weapon: "awp" }).points.map((p) => p.round)).toEqual([
      13,
    ]);
    expect(buildHeatmap([match(ev)], F).weapons).toEqual(["ak47", "awp"]);
    expect(buildHeatmap([match(ev)], { ...F, matchIds: ["other"] }).filters.matches).toBe(0);
  });

  it("a match on another map never enters the heatmap", () => {
    const r = buildHeatmap([match(ev, { map: "de_mirage" })], F);
    expect(r.filters.matches).toBe(0);
    expect(r.events.status).toBe("NOT_OBSERVED");
  });

  it("a map without a validated transform draws nothing and says why", () => {
    const r = buildHeatmap([match(ev, { map: "de_mirage" })], { ...F, map: "de_mirage" });
    expect(r.support).toBe("NOT_VALIDATED");
    expect(r.events.status).toBe("UNAVAILABLE");
    expect(r.cells).toEqual([]);
    expect(r.points).toEqual([]);
  });
});

describe("aggregation", () => {
  it("bins into 32×32 cells; counts add up to the plotted events", () => {
    const ev = [
      kill({ round: 1, data: { victim_position: w(1, 1) } }),
      kill({ round: 2, data: { victim_position: w(31, 31) } }),
      kill({ round: 3, data: { victim_position: w(1023.9, 1023.9) } }),
    ];
    const r = buildHeatmap([match(ev)], F);
    expect(r.cells).toEqual([
      { cell: 0, col: 0, row: 0, count: 2 },
      { cell: 1023, col: 31, row: 31, count: 1 },
    ]);
  });

  it("is idempotent and independent of input order", () => {
    const ev = Array.from({ length: 40 }, (_, i) =>
      kill({ round: (i % 24) + 1, data: { victim_position: w(10 + i * 20, 500) } }),
    );
    const a = buildHeatmap([match(ev)], F);
    const b = buildHeatmap([match([...ev].reverse())], F);
    expect(b).toEqual(a);
    expect(buildHeatmap([match(ev)], F)).toEqual(a);
  });

  it("a large match keeps counts complete and caps the drill-down payload", () => {
    const ev = Array.from({ length: HEATMAP_MAX_POINTS + 50 }, (_, i) =>
      kill({ round: (i % 24) + 1, data: { victim_position: w((i % 1000) + 1, (i % 900) + 1) } }),
    );
    const r = buildHeatmap([match(ev)], F);
    expect(r.events.value).toBe(HEATMAP_MAX_POINTS + 50);
    expect(r.cells.reduce((s, c) => s + c.count, 0)).toBe(HEATMAP_MAX_POINTS + 50);
    expect(r.points).toHaveLength(HEATMAP_MAX_POINTS);
    expect(r.pointsTruncated).toBe(true);
  });
});

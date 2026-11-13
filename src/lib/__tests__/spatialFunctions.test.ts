/**
 * PM1 / 4.2.2 — the spatial heatmap server read: input validated on the server, read-only under
 * the caller's session, own participant only, compact payload (two position fields, never ticks).
 * Cross-user isolation of the underlying tables is proven on a disposable database by
 * scripts/queue/rls_two_users_probe.py (round_events, round_players).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildHeatmap } from "@/lib/spatial/heatmap";
import {
  defaultMap,
  mapOptions,
  spatialHeatmapInput,
  toHeatmapEvent,
  type SpatialEventRow,
} from "@/lib/spatial.functions";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const fn = read("src/lib/spatial.functions.ts");

describe("server-side input validation", () => {
  it("applies safe defaults", () => {
    expect(spatialHeatmapInput.parse({})).toEqual({
      layer: "DEATHS",
      side: "ALL",
      level: "default",
    });
  });
  it("rejects client-supplied identity and unknown fields", () => {
    for (const extra of [
      { userId: "x" },
      { playerId: "x" },
      { participantKey: "1" },
      { ownerId: "x" },
    ])
      expect(() => spatialHeatmapInput.parse(extra)).toThrow();
  });
  it("rejects malformed filters", () => {
    for (const bad of [
      { map: "de_dust2'; drop" },
      { map: "DE_DUST2" },
      { layer: "PRESENCE" },
      { layer: "DAMAGE_DEALT" },
      { side: "BOTH" },
      { level: "upper" },
      { matchId: "not-a-uuid" },
      { weapon: "ak47,awp" },
      { weapon: "x".repeat(33) },
    ])
      expect(() => spatialHeatmapInput.parse(bad), JSON.stringify(bad)).toThrow();
  });
});

describe("read path", () => {
  it("is read-only under the caller's session: no writes, no service role", () => {
    expect(fn).toContain(".middleware([requireSupabaseAuth])");
    expect(fn).not.toMatch(
      /service_role|client\.server|supabaseAdmin|\.(insert|update|upsert|delete|rpc)\(/,
    );
  });

  it("reads per match, own participant only, kill events only", () => {
    expect(fn).toContain('.eq("match_id", matchId)');
    expect(fn).toContain('.eq("event_type", "kill")');
    expect(fn).toContain(
      ".or(`actor_steam_id.eq.${participantKey},victim_steam_id.eq.${participantKey}`)",
    );
    expect(fn).toContain('.eq("participant_key", participantKey)');
    // Participant keys are digit-only before being interpolated into a filter (xray.functions).
    expect(read("src/lib/xray.functions.ts")).toContain("/^\\d{1,20}$/.test(key)");
  });

  it("selects only the two position fields of data, never the whole jsonb or a tick stream", () => {
    expect(fn).toContain("position:data->position, victim_position:data->victim_position");
    expect(fn).not.toMatch(/select\([^)]*\bdata\b(?!->)/);
    expect(fn).not.toMatch(/parse_ticks|position_snapshots/);
  });

  it("never silently truncates a match", () => {
    expect(fn).toContain('throw new Error("SPATIAL_EVENTS_LIMIT")');
  });

  it("a match id outside the caller's own matches is never queried", () => {
    expect(fn).toContain("data.matchId ? onMap.filter((m) => m.matchId === data.matchId) : onMap");
  });
});

describe("pure helpers", () => {
  it("map options list supported maps first, then not validated, by matches", () => {
    const maps = mapOptions([
      { map: "de_mirage" },
      { map: "de_cache" },
      { map: "de_cache" },
      { map: "de_dust2" },
      { map: null },
      { map: "workshop/1/de_dust2" },
    ]);
    expect(maps).toEqual([
      { map: "de_dust2", support: "SUPPORTED", matches: 2 },
      { map: "de_cache", support: "NOT_VALIDATED", matches: 2 },
      { map: "de_mirage", support: "NOT_VALIDATED", matches: 1 },
    ]);
    expect(defaultMap(maps)).toBe("de_dust2");
  });

  it("an absent position stays absent (MISSING), never becomes (0,0)", () => {
    const row: SpatialEventRow = {
      id: "e1",
      round_number: 1,
      tick: 10,
      event_type: "kill",
      actor_steam_id: "2",
      victim_steam_id: "1",
      weapon: "ak47",
      headshot: false,
      position: null,
      victim_position: null,
    };
    const ev = toHeatmapEvent("m1")(row);
    expect(ev.data).toEqual({});
    const r = buildHeatmap(
      [{ matchId: "m1", map: "de_dust2", participantKey: "1", rounds: [], events: [ev] }],
      { map: "de_dust2", layer: "DEATHS", side: "ALL", level: "default" },
    );
    expect(r.excluded).toEqual({ MISSING: 1 });
    expect(r.points).toEqual([]);
  });
});

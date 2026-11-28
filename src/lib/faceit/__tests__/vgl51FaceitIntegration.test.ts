/** VGL 5.1 — Frente 2: FACEIT matches in My Matches, per-metric aggregation, auto-sync. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { rankMaps } from "@/lib/maps/mapRanking";
import {
  METRIC_SOURCE_POLICY,
  isImportedSource,
  pooledValue,
  type PooledMatchInput,
} from "@/lib/metrics/canonicalAggregate";
import { faceitWritableMatchIds } from "@/lib/faceit/faceitOwnership";
import { safeFaceitUrl } from "@/lib/faceitMatches.functions";
import { aggregate, type OverviewMatch } from "@/lib/playerOverview";

const read = (p: string) => readFileSync(p, "utf8");

let n = 0;
function m(source: string | null, over: Partial<OverviewMatch> = {}): OverviewMatch {
  n += 1;
  return {
    matchId: `m${n}`,
    map: "de_mirage",
    playedAt: new Date(Date.UTC(2026, 10, 1) + n * 864e5).toISOString(),
    dateSource: "played",
    resultStatus: "KNOWN",
    result: "win",
    scorePlayer: 13,
    scoreOpponent: 9,
    source,
    kills: 20,
    deaths: 10,
    assists: 3,
    adr: 90,
    kast: 75,
    hsPercent: 50,
    rating: 1.2,
    roundsPlayed: 22,
    ...over,
  } as unknown as OverviewMatch;
}

describe("per-metric source policy", () => {
  it("rating is demo-only; K/D, ADR, HS% and KAST accept FACEIT", () => {
    expect(METRIC_SOURCE_POLICY).toEqual({
      adr: "all",
      kast: "all",
      hsPercent: "all",
      kd: "all",
      rating: "demo-only",
    });
    expect(isImportedSource("faceit")).toBe(true);
    expect(isImportedSource("demo")).toBe(false);
    expect(isImportedSource(null)).toBe(false);
  });

  it("a FACEIT 'rating' never enters the pooled rating; its kills/deaths/damage do", () => {
    const demo = m("demo", { kills: 20, deaths: 10, adr: 80, rating: 1.1, roundsPlayed: 20 });
    const fi = m("faceit", { kills: 10, deaths: 10, adr: 100, rating: 9.9, roundsPlayed: 20 });
    const both = [demo, fi] as PooledMatchInput[];
    expect(pooledValue(both, "rating").value).toBeCloseTo(1.1, 6);
    expect(pooledValue(both, "rating").matches).toBe(1);
    expect(pooledValue(both, "kd").value).toBeCloseTo(30 / 20, 6);
    expect(pooledValue(both, "adr").value).toBeCloseTo((80 * 20 + 100 * 20) / 40, 6);
  });

  it("a FACEIT match without KAST/HS% adds nothing to them (never zero)", () => {
    const demo = m("demo", { kast: 70, hsPercent: 40 });
    const fi = m("faceit", { kast: null, hsPercent: null });
    expect(pooledValue([demo, fi], "kast").value).toBeCloseTo(70, 6);
    expect(pooledValue([demo, fi], "hsPercent").value).toBeCloseTo(40, 6);
  });

  it("overview aggregates: match count and win rate include FACEIT; rating stays demo", () => {
    const a = aggregate([m("demo", { rating: 1.0 }), m("faceit", { rating: 3, result: "loss" })])!;
    expect(a.matches).toBe(2);
    expect(a.decided).toBe(2);
    expect(a.wins).toBe(1);
    expect(a.rating).toBeCloseTo(1.0, 6);
  });

  it("Best Map ignores imported matches (it is built on CS2 PRO's rating)", () => {
    const faceitOnly = Array.from({ length: 6 }, () => m("faceit"));
    expect(rankMaps(faceitOnly).state).not.toBe("READY");
    expect(rankMaps(faceitOnly).eligibleMatches).toBe(0);
  });
});

describe("dedup with demos (PR #443 preserved)", () => {
  it("a FACEIT observation linked to a demo match never writes on the demo row", () => {
    expect(
      faceitWritableMatchIds([
        { id: "d", data_source: "demo" },
        { id: "f", data_source: "faceit" },
      ]),
    ).toEqual({ writable: ["f"], linkedToDemo: ["d"] });
    const sync = read("src/lib/faceit/faceit.sync.server.ts");
    expect(sync).toContain('.eq("data_source", "faceit")');
  });
});

describe("automatic sync preference", () => {
  const migration = read("supabase/migrations/20261128190000_vgl51_faceit_auto_sync.sql");
  const fn = read("src/lib/faceit.functions.ts");
  const sync = read("src/lib/faceit/faceit.sync.server.ts");
  const cron = read("src/routes/api/public/pipeline-cron.ts");

  it("nullable column (undecided ≠ off), no client UPDATE policy, RLS untouched", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS auto_sync boolean,");
    expect(migration).not.toMatch(/auto_sync boolean (NOT NULL|DEFAULT)/);
    expect(migration).not.toMatch(/CREATE POLICY|ALTER POLICY|DROP POLICY|GRANT/);
  });

  it("the setter only touches the caller's own connected FACEIT link; enabling queues an incremental", () => {
    const setter = fn.slice(
      fn.indexOf("export const setFaceitAutoSync"),
      fn.indexOf("/** Disconnects"),
    );
    expect(setter).toContain(".middleware([requireSupabaseAuth])");
    expect(setter).toContain("requirePlayerId(context.userId)");
    expect(setter).toContain('.eq("player_id", playerId)');
    expect(setter).toContain('connection.status !== "connected"');
    expect(setter).toContain('enqueueFaceitSync(playerId, connection.id, "incremental")');
    expect(setter).not.toMatch(/\.delete\(/);
  });

  it("the scheduler queues only opted-in, connected links past the interval, in small batches", () => {
    const fnBody = sync.slice(sync.indexOf("export async function enqueueDueFaceitAutoSyncs"));
    expect(fnBody).toContain('.eq("status", "connected")');
    expect(fnBody).toContain('.eq("auto_sync", true)');
    expect(fnBody).toContain(".limit(FACEIT_AUTO_SYNC_BATCH)");
    expect(fnBody).toContain('enqueueFaceitSync(row.player_id, row.id, "incremental")');
    expect(sync).toContain("FACEIT_AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000");
    expect(cron).toContain("enqueueDueFaceitAutoSyncs()");
    // Demo pipeline steps are untouched.
    expect(cron).toContain("reconcileDurableDemoQueue(25)");
  });

  it("the panel asks explicitly when undecided and offers a switch afterwards", () => {
    const panel = read("src/components/integrations/FaceitPanel.tsx");
    expect(panel).toContain("data-faceit-auto-sync-choice");
    expect(panel).toContain('t("vgl51.faceit.auto.enable")');
    expect(panel).toContain('t("vgl51.faceit.auto.keepManual")');
    expect(panel).toContain("<Switch");
  });
});

describe("My Matches and the FACEIT Match Room", () => {
  it("rows carry a source tag; FACEIT rows open the FACEIT room (no demo tabs)", () => {
    const table = read("src/components/real/RealData.tsx");
    expect(table).toContain("{mixed ? <MatchSourceTag source={row.source} /> : null}");
    const room = read("src/components/real/RealMatchRoom.tsx");
    expect(room).toMatch(
      /isImportedSource\(match\.source\) \? \(\s*\/\/[^\n]*\n[^<]*<FaceitMatchRoom/,
    );
    const faceitRoom = read("src/components/integrations/FaceitMatchRoom.tsx");
    expect(faceitRoom).toContain("data-faceit-room-unavailable");
    expect(faceitRoom).not.toMatch(/RealRoundsPage|RealReplayPage|RealHeatmapPage/);
  });

  it("only https FACEIT links are ever shown", () => {
    expect(safeFaceitUrl("https://www.faceit.com/{lang}/cs2/room/1-abc")).toBe(
      "https://www.faceit.com/en/cs2/room/1-abc",
    );
    expect(safeFaceitUrl("http://www.faceit.com/en/cs2/room/1")).toBeNull();
    expect(safeFaceitUrl("https://evil.example/faceit.com")).toBeNull();
    expect(safeFaceitUrl(null)).toBeNull();
  });

  it("texts exist in the five languages", () => {
    for (const l of ["pt-BR", "en", "es", "fr", "pt-PT"]) {
      const b = read(`src/i18n/locales/vgl5/${l}.ts`);
      for (const k of [
        "vgl51.faceit.tag",
        "vgl51.faceit.auto.title",
        "vgl51.faceit.auto.explain",
        "vgl51.faceit.room.unavailableBody",
        "vgl51.faceit.room.notReported",
      ])
        expect(b).toContain(`"${k}"`);
    }
  });
});

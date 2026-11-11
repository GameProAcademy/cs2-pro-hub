/**
 * Fundação 4.2 — Player DNA dna-weighted-v2: each quantity counts once, means are pooled by
 * the match's own sample, thin event samples never shape a dimension, NULL is never 0, and
 * what the player sees is what the snapshot stores (quarantine, digest, read-only GET).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FEATURE_CATALOG } from "../pipeline/features.catalog";
import {
  buildPlayerDna,
  DNA_COMPLEMENT_OF,
  DNA_MIN_EVENT_SAMPLE,
  DNA_VERSION,
  publishableDna,
  type DnaFeatureRow,
} from "../playerDna";
import { snapshotDigestInput, snapshotRow } from "../playerDnaSnapshot";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const row = (
  id: string,
  features: Record<string, Record<string, unknown>>,
  extra: Partial<DnaFeatureRow> = {},
): DnaFeatureRow => ({
  match_id: id,
  partial_parse: false,
  sample_rounds: 20,
  sample_opening_duels: 0,
  sample_clutches: 0,
  features,
  ...extra,
});
const dim = (rows: DnaFeatureRow[], d: string) =>
  buildPlayerDna(rows).dimensions.find((x) => x.dimension === d)!;
const sig = (rows: DnaFeatureRow[], d: string, name: string) =>
  dim(rows, d).signals.find((s) => s.name === name)!;

describe("version", () => {
  it("is dna-weighted-v2 and is part of the snapshot digest", () => {
    expect(DNA_VERSION).toBe("dna-weighted-v2");
    expect(snapshotDigestInput([])).toContain('"dna_version":"dna-weighted-v2"');
  });
});

describe("each quantity counts once", () => {
  it("every declared complement is, in the catalogue, exactly 1 − its source, same dimension", () => {
    for (const [complement, source] of Object.entries(DNA_COMPLEMENT_OF)) {
      const [cd, cn] = complement.split(".") as [string, string];
      const [sd, sn] = source.split(".") as [string, string];
      expect(cd).toBe(sd);
      const c = (
        FEATURE_CATALOG as Record<
          string,
          Record<string, { formula: string; meaning: string; direction: string }>
        >
      )[cd]![cn]!;
      const s = (FEATURE_CATALOG as Record<string, Record<string, { direction: string }>>)[sd]![
        sn
      ]!;
      expect(c.meaning).toContain(`complement of ${sn}`);
      expect(c.formula.startsWith("1 - ")).toBe(true);
      expect(s.direction).toBe("down");
      expect(c.direction).toBe("up");
    }
  });

  it("the production case: survivability no longer counts early deaths twice", () => {
    // thiago1010's real pooled signals (2026-11-10): v1 showed 57, the single-count value is 47.
    const features = {
      survivability: {
        survival_rate: 0.471,
        early_death_rate: 0.049,
        early_death_avoidance: 0.951,
        untraded_death_rate: 0.806,
        damage_taken_per_round: 0.72,
      },
    };
    const d = dim([row("a", features)], "survivability");
    expect(d.value).toBeCloseTo((0.471 + 0.951 + 0.194 + 0.28) / 4, 6);
    expect(Math.round((d.value as number) * 100)).toBe(47);
    const dup = d.signals.find((s) => s.name === "early_death_avoidance")!;
    expect(dup).toMatchObject({ foldedIntoDimension: false, notFolded: "COMPLEMENT", mean: 0.951 });
  });

  it("positioning: first-death rate and its complement count once", () => {
    const d = dim(
      [
        row("a", {
          positioning: {
            traded_death_rate: 0.194,
            first_death_rate: 0.056,
            first_death_avoidance: 0.944,
          },
        }),
      ],
      "positioning",
    );
    expect(d.value).toBeCloseTo((0.194 + 0.944) / 2, 6);
  });

  it("no folded signal of a dimension is the complement of another folded one", () => {
    const all: Record<string, Record<string, number>> = {};
    for (const [d, signals] of Object.entries(FEATURE_CATALOG)) {
      all[d] = Object.fromEntries(Object.keys(signals).map((n) => [n, 0.5]));
    }
    const dna = buildPlayerDna([row("a", all, { sample_opening_duels: 50, sample_clutches: 50 })]);
    for (const d of dna.dimensions) {
      const folded = d.signals
        .filter((s) => s.foldedIntoDimension)
        .map((s) => `${d.dimension}.${s.name}`);
      for (const [c, s] of Object.entries(DNA_COMPLEMENT_OF))
        expect(folded.includes(c) && folded.includes(s)).toBe(false);
    }
  });
});

describe("pooled, sample-weighted means", () => {
  it("round-denominated signals are weighted by rounds (equals the pooled value)", () => {
    // 30 rounds at KAST 0.60 and 10 rounds at 1.00 → pooled 28/40 = 0.70 (plain mean: 0.80).
    const rows = [
      row("a", { decision_making: { kast: 0.6 } }, { sample_rounds: 30 }),
      row("b", { decision_making: { kast: 1 } }, { sample_rounds: 10 }),
    ];
    const s = sig(rows, "decision_making", "kast");
    expect(s.mean).toBeCloseTo(0.7, 9);
    expect(s).toMatchObject({ sample: 40, sampleUnit: "rounds", matches: 2 });
  });

  it("clutch win rate is pooled over clutch situations, not averaged per match", () => {
    // 1 of 1 and 2 of 11 → pooled 3/12 = 0.25 (v1 said 0.59).
    const rows = [
      row("a", { clutch: { clutch_win_rate: 1 } }, { sample_clutches: 1 }),
      row("b", { clutch: { clutch_win_rate: 2 / 11 } }, { sample_clutches: 11 }),
    ];
    const s = sig(rows, "clutch", "clutch_win_rate");
    expect(s.mean).toBeCloseTo(0.25, 9);
    expect(s).toMatchObject({ sample: 12, sampleUnit: "clutches", foldedIntoDimension: true });
  });

  it("legacy rows without a sample fall back to the plain mean, never to a guessed weight", () => {
    const rows = [
      row("a", { aim: { hs_rate: 0.2 } }, { sample_rounds: null }),
      row("b", { aim: { hs_rate: 0.6 } }, { sample_rounds: 30 }),
    ];
    const s = sig(rows, "aim", "hs_rate");
    expect(s.mean).toBeCloseTo(0.4, 9);
    expect(s.sample).toBeNull();
  });

  it("a match that did not observe the signal adds neither value nor weight (NULL ≠ 0)", () => {
    const rows = [
      row("a", { aim: { hs_rate: 0.5 } }, { sample_rounds: 10 }),
      row("b", { aim: { hs_rate: null } }, { sample_rounds: 90 }),
    ];
    const s = sig(rows, "aim", "hs_rate");
    expect(s).toMatchObject({ mean: 0.5, sample: 10, matches: 1 });
  });

  it("an observed 0 stays 0 and is weighted like any other value", () => {
    const rows = [
      row("a", { aim: { hs_rate: 0 } }, { sample_rounds: 20 }),
      row("b", { aim: { hs_rate: 0.5 } }, { sample_rounds: 20 }),
    ];
    expect(sig(rows, "aim", "hs_rate").mean).toBeCloseTo(0.25, 9);
  });
});

describe("thin event samples never shape a dimension", () => {
  it(`fewer than ${DNA_MIN_EVENT_SAMPLE} pooled clutches: listed with its real value, not folded`, () => {
    const rows = ["a", "b", "c"].map((id) =>
      row(id, { clutch: { clutch_win_rate: 0.5, multi_kill_rate: 0.15 } }, { sample_clutches: 2 }),
    );
    const d = dim(rows, "clutch");
    const s = d.signals.find((x) => x.name === "clutch_win_rate")!;
    expect(s).toMatchObject({
      mean: 0.5,
      sample: 6,
      foldedIntoDimension: false,
      notFolded: "THIN_SAMPLE",
    });
    expect(d.value).toBeCloseTo(0.15, 9); // only the round-denominated signal
  });

  it("opening duels follow the same rule, in both dimensions that read them", () => {
    const thin = [
      row(
        "a",
        { dueling: { opening_success: 1 }, decision_making: { opening_discipline: 1 } },
        { sample_opening_duels: 9 },
      ),
    ];
    expect(sig(thin, "dueling", "opening_success").notFolded).toBe("THIN_SAMPLE");
    expect(sig(thin, "decision_making", "opening_discipline").notFolded).toBe("THIN_SAMPLE");
    const enough = [row("a", { dueling: { opening_success: 1 } }, { sample_opening_duels: 10 })];
    expect(sig(enough, "dueling", "opening_success").foldedIntoDimension).toBe(true);
  });

  it("a dimension whose only observed signal is thin has NO value (never 0)", () => {
    const d = dim([row("a", { clutch: { clutch_win_rate: 0 } }, { sample_clutches: 3 })], "clutch");
    expect(d.value).toBeNull();
  });
});

describe("states, duplicates and the client view", () => {
  it("0, 1, 2 and 3 matches", () => {
    const f = { aim: { hs_rate: 0.5 } };
    expect(buildPlayerDna([]).state).toBe("EMPTY");
    expect(buildPlayerDna([row("a", f)]).state).toBe("INSUFFICIENT_SAMPLE");
    expect(buildPlayerDna([row("a", f), row("b", f)]).state).toBe("INSUFFICIENT_SAMPLE");
    expect(buildPlayerDna([row("a", f), row("b", f), row("c", f)]).state).toBe("READY");
  });

  it("the same match twice is one match (a duplicate cannot make a profile READY)", () => {
    const f = { aim: { hs_rate: 0.5 } };
    const dna = buildPlayerDna([row("a", f), row("a", f), row("b", f)]);
    expect(dna.matches).toBe(2);
    expect(dna.state).toBe("INSUFFICIENT_SAMPLE");
  });

  it("partial matches are counted and their round-denominated nulls stay null", () => {
    const dna = buildPlayerDna([
      row("a", { aim: { kills_per_round: null, hs_rate: 0.4 } }, { partial_parse: true }),
      row("b", { aim: { kills_per_round: 0.7, hs_rate: 0.6 } }),
    ]);
    expect(dna.partialMatches).toBe(1);
    const kpr = dna.dimensions
      .find((d) => d.dimension === "aim")!
      .signals.find((s) => s.name === "kills_per_round")!;
    expect(kpr).toMatchObject({ mean: 0.7, matches: 1 });
  });

  it("below the minimum sample no dimension value leaves the server", () => {
    const pub = publishableDna(buildPlayerDna([row("a", { aim: { hs_rate: 0.5 } })]));
    expect(pub.dimensions.every((d) => d.value === null)).toBe(true);
    expect(pub.dimensions.find((d) => d.dimension === "aim")!.observed).toBe(true);
  });

  it("is deterministic and independent of row order", () => {
    const rows = [
      row(
        "a",
        { aim: { hs_rate: 0.3 }, clutch: { clutch_win_rate: 0.2 } },
        { sample_rounds: 22, sample_clutches: 5 },
      ),
      row(
        "b",
        { aim: { hs_rate: 0.6 }, clutch: { clutch_win_rate: 0.5 } },
        { sample_rounds: 30, sample_clutches: 6 },
      ),
      row("c", { aim: { hs_rate: 0.5 } }, { sample_rounds: 18 }),
    ];
    const a = JSON.stringify(buildPlayerDna(rows));
    expect(JSON.stringify(buildPlayerDna([...rows]))).toBe(a);
    const reversed = buildPlayerDna([...rows].reverse());
    for (const d of buildPlayerDna(rows).dimensions) {
      const other = reversed.dimensions.find((x) => x.dimension === d.dimension)!;
      if (d.value === null) expect(other.value).toBeNull();
      else expect(other.value).toBeCloseTo(d.value, 12);
    }
  });
});

describe("snapshots", () => {
  const rows = ["a", "b", "c"].map((id) => row(id, { aim: { hs_rate: 0.5 } }));
  it("the digest changes with a sample, a feature, a version or a match; not with order", () => {
    const base = snapshotDigestInput(rows);
    expect(snapshotDigestInput([...rows].reverse())).toBe(base);
    expect(
      snapshotDigestInput(rows.map((r, i) => (i ? r : { ...r, sample_clutches: 3 }))),
    ).not.toBe(base);
    expect(
      snapshotDigestInput(
        rows.map((r, i) => (i ? r : { ...r, features: { aim: { hs_rate: 0.51 } } })),
      ),
    ).not.toBe(base);
    expect(snapshotDigestInput(rows.slice(0, 2))).not.toBe(base);
    expect(snapshotDigestInput(rows.map((r) => ({ ...r, analysis_version: "v2" })))).not.toBe(base);
  });

  it("stores the version, the inputs and NULL (never 0) for a dimension without a value", () => {
    const stored = snapshotRow("p", buildPlayerDna(rows), rows, "d".repeat(64))!;
    expect(stored).toMatchObject({
      dna_version: "dna-weighted-v2",
      match_count: 3,
      state: "READY",
      aim: 50,
    });
    expect(stored.economy).toBeNull();
    expect(stored.clutch).toBeNull();
    expect(stored.source_match_ids).toEqual(["a", "b", "c"]);
  });
});

describe("what the player sees is what the snapshot stores", () => {
  const data = read("src/lib/playerData.functions.ts");
  const snap = read("src/lib/playerDnaSnapshot.server.ts");
  it("the read is read-only: no write, no service-role snapshot refresh in the GET", () => {
    const get = data.slice(
      data.indexOf("export const getRealPlayerDna"),
      data.indexOf("export const refreshOwnDnaSnapshot"),
    );
    expect(get).toContain('createServerFn({ method: "GET" })');
    expect(get).not.toMatch(
      /refreshOwnPlayerDnaSnapshot|\.upsert\(|\.insert\(|\.update\(|\.delete\(/,
    );
    expect(get).toContain('.eq("input_digest", digest)');
  });

  it("the write is an explicit authenticated POST with no client input", () => {
    const post = data.slice(
      data.indexOf("export const refreshOwnDnaSnapshot"),
      data.indexOf("* Shared loaders"),
    );
    expect(post).toContain('createServerFn({ method: "POST" })');
    expect(post).toContain(".middleware([requireSupabaseAuth])");
    expect(post).not.toContain("inputValidator");
    expect(post).toContain('ownPlayerIds(context.supabase, context.userId, "PLAYER_DNA")');
  });

  it("both paths read the same columns and exclude quarantined matches, failing closed", () => {
    const columns =
      "match_id, partial_parse, sample_rounds, sample_opening_duels, sample_clutches, features, schema_version, analysis_version, created_at";
    expect(data).toContain(columns);
    expect(snap).toContain(columns);
    expect(data).toContain("rows = all.filter((row) => !quarantined.has(row.match_id))");
    expect(data).toContain(
      "visibleMetrics = (metrics ?? []).filter((row) => !quarantined.has(row.match_id))",
    );
    const helper = read("src/lib/quarantineRead.server.ts");
    expect(helper).toContain("QUARANTINE_READ_FAILED");
    expect(helper).toContain('.select("match_id")');
  });

  it("the service-role client is only ever imported lazily from server-only modules", () => {
    expect(data).not.toMatch(/^import .*client\.server/m);
    expect(data).toContain('await import("@/lib/quarantineRead.server")');
  });

  it("the page asks for a missing snapshot once, through the POST", () => {
    const page = read("src/components/real/RealDna.tsx");
    expect(page).toContain("mutationFn: () => refreshOwnDnaSnapshot()");
    expect(page).toContain("asked.current = true");
    expect(read("src/routes/_authenticated/dashboard.tsx")).not.toContain("refreshOwnDnaSnapshot");
  });
});

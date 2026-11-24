import { describe, expect, it } from "vitest";

import { buildPlayerDna, DNA_VERSION } from "@/lib/playerDna";
import {
  buildPlayerDnaV3,
  DNA_VERSION_V3,
  publishableDnaV3,
  asRealPlayerDna,
  type DnaFeatureRowV3,
} from "@/lib/playerDnaV3";

const row = (
  id: string,
  f: Record<string, Record<string, number | null>>,
  s: Partial<DnaFeatureRowV3> = {},
): DnaFeatureRowV3 => ({
  match_id: id,
  partial_parse: false,
  sample_rounds: 20,
  sample_opening_duels: 4,
  sample_clutches: 2,
  sample_kills: 15,
  features: f,
  ...s,
});
const dim = (dna: ReturnType<typeof buildPlayerDnaV3>, d: string) =>
  dna.dimensions.find((x) => x.dimension === d)!;
const sig = (dna: ReturnType<typeof buildPlayerDnaV3>, d: string, key: string) =>
  dim(dna, d).signals.find((s) => s.key === key)!;

describe("dna-weighted-v3", () => {
  it("is a new version next to v2", () => {
    expect(DNA_VERSION_V3).toBe("dna-weighted-v3");
    expect(DNA_VERSION).toBe("dna-weighted-v2");
  });

  it("R-05: weights HS by kills, so it equals Σ HS kills ÷ Σ kills", () => {
    const rows = [
      row("a", { aim: { hs_rate: 0.5 } }, { sample_rounds: 30, sample_kills: 10 }),
      row("b", { aim: { hs_rate: 1 } }, { sample_rounds: 10, sample_kills: 30 }),
    ];
    const v3 = sig(buildPlayerDnaV3(rows), "aim", "aim.hs_rate");
    expect(v3.mean).toBeCloseTo((5 + 30) / 40, 10);
    expect(v3).toMatchObject({ sample: 40, sampleUnit: "kills" });
    // v2 keeps its rounds weighting (unchanged): (0.5·30 + 1·10) / 40.
    const v2 = buildPlayerDna(rows)
      .dimensions.find((d) => d.dimension === "aim")!
      .signals.find((s) => s.name === "hs_rate")!;
    expect(v2.mean).toBeCloseTo(25 / 40, 10);
  });

  it("R-04: Clutch is only the clutch win rate; multi-kill is a Duels signal", () => {
    const f = { clutch: { clutch_win_rate: 0.5, multi_kill_rate: 0.2, clutch_frequency: 0.1 } };
    const thin = buildPlayerDnaV3([row("a", f, { sample_clutches: 6 })]);
    expect(dim(thin, "clutch")).toMatchObject({ value: null, status: "NO_SAMPLE" });
    expect(dim(thin, "clutch").signals.map((s) => s.key)).not.toContain("clutch.multi_kill_rate");
    expect(sig(thin, "dueling", "clutch.multi_kill_rate").mean).toBe(0.2);
    const enough = buildPlayerDnaV3([row("a", f, { sample_clutches: 12 })]);
    expect(dim(enough, "clutch")).toMatchObject({ value: 0.5, status: "MEASURED" });
    // v2 unchanged: multi-kill still folded into Clutch there.
    const v2clutch = buildPlayerDna([row("a", f, { sample_clutches: 6 })]).dimensions.find(
      (d) => d.dimension === "clutch",
    )!;
    expect(v2clutch.value).toBe(0.2);
  });

  it("R-35: opening discipline is the same quantity as opening success and is not folded twice", () => {
    const dna = buildPlayerDnaV3([
      row(
        "a",
        {
          dueling: { opening_success: 0.6 },
          decision_making: { opening_discipline: 0.6, kast: 0.7 },
        },
        { sample_opening_duels: 12 },
      ),
    ]);
    expect(sig(dna, "decision_making", "decision_making.opening_discipline").notFolded).toBe(
      "DUPLICATE",
    );
    expect(dim(dna, "decision_making").value).toBeCloseTo(0.7, 10);
  });

  it("R-36: Economy is NOT_MEASURED, distinct from a dimension without sample", () => {
    const dna = buildPlayerDnaV3([row("a", { aim: { hs_rate: 0.5 } })]);
    expect(dim(dna, "economy")).toMatchObject({ value: null, status: "NOT_MEASURED", foldable: 0 });
    expect(dim(dna, "utility")).toMatchObject({ value: null, status: "NO_SAMPLE" });
  });

  it("half rule: a dimension needs at least half of its foldable signals", () => {
    const one = buildPlayerDnaV3([row("a", { aim: { hs_rate: 0.5 } })]);
    expect(dim(one, "aim")).toMatchObject({ foldable: 4, foldedWithValue: 1, value: null });
    const two = buildPlayerDnaV3([row("a", { aim: { hs_rate: 0.5, kills_per_round: 0.7 } })]);
    expect(dim(two, "aim").value).toBeCloseTo(0.6, 10);
  });

  it("positioning's map spread is not derivable and never blocks the dimension", () => {
    const dna = buildPlayerDnaV3([
      row("a", { positioning: { traded_death_rate: 0.3, first_death_rate: 0.1 } }),
    ]);
    expect(sig(dna, "positioning", "positioning.map_spread").notFolded).toBe("NOT_DERIVABLE");
    expect(dim(dna, "positioning").value).toBeCloseTo((0.3 + 0.9) / 2, 10);
  });

  it("NULL is never 0, and a provisional profile publishes no dimension value", () => {
    const dna = buildPlayerDnaV3([row("a", { aim: { hs_rate: null, kills_per_round: 0.7 } })]);
    expect(sig(dna, "aim", "aim.hs_rate").mean).toBeNull();
    expect(dna.state).toBe("INSUFFICIENT_SAMPLE");
    expect(publishableDnaV3(dna).dimensions.every((d) => d.value === null)).toBe(true);
  });
});

describe("asRealPlayerDna (what leaves the server)", () => {
  it("withholds provisional values, keeps observed/status and the signals", () => {
    const v3 = buildPlayerDnaV3([
      row("a", { aim: { hs_rate: 0.5, kills_per_round: 0.7 } }),
      row("b", { aim: { hs_rate: 0.5, kills_per_round: 0.7 } }),
    ]);
    const pub = asRealPlayerDna(v3);
    const aim = pub.dimensions.find((d) => d.dimension === "aim")!;
    expect(pub.version).toBe("dna-weighted-v3");
    expect(aim).toMatchObject({ value: null, observed: true, status: "MEASURED" });
    expect(aim.signals.find((s) => s.name === "hs_rate")!.mean).toBe(0.5);
    expect(pub.dimensions.find((d) => d.dimension === "economy")).toMatchObject({
      observed: false,
      status: "NOT_MEASURED",
    });
  });
});

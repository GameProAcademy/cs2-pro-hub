import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPlayerDna, DNA_MIN_MATCHES, type DnaFeatureRow } from "../playerDna";
import { FEATURE_CATALOG } from "../pipeline/features.catalog";

const row = (
  matchId: string,
  features: Record<string, Record<string, unknown>>,
  extra: Partial<DnaFeatureRow> = {},
): DnaFeatureRow => ({
  match_id: matchId,
  partial_parse: false,
  sample_rounds: 24,
  features,
  ...extra,
});

describe("real Player DNA: observed signals only", () => {
  it("is EMPTY without rows and invents nothing", () => {
    const dna = buildPlayerDna([]);
    expect(dna.state).toBe("EMPTY");
    expect(
      dna.dimensions.every((d) => d.value === null && d.signals.every((s) => s.mean === null)),
    ).toBe(true);
  });

  it("flags a sample below the minimum and still reports the real values", () => {
    const dna = buildPlayerDna([row("m1", { aim: { hs_rate: 0.5 } })]);
    expect(dna.state).toBe("INSUFFICIENT_SAMPLE");
    expect(DNA_MIN_MATCHES).toBe(3);
    const aim = dna.dimensions.find((d) => d.dimension === "aim")!;
    expect(aim.signals.find((s) => s.name === "hs_rate")).toMatchObject({ mean: 0.5, matches: 1 });
  });

  it("averages a signal only over matches that observed it; null is never 0", () => {
    const dna = buildPlayerDna([
      row("m1", { aim: { hs_rate: 0.4 } }),
      row("m2", { aim: { hs_rate: null } }),
      row("m3", { aim: { hs_rate: 0.6 } }),
    ]);
    expect(dna.state).toBe("READY");
    const signal = dna.dimensions
      .find((d) => d.dimension === "aim")!
      .signals.find((s) => s.name === "hs_rate")!;
    expect(signal.mean).toBeCloseTo(0.5);
    expect(signal.matches).toBe(2);
  });

  it("folds lower-is-better signals as complements and never folds neutral or unbounded ones", () => {
    const downName = Object.entries(FEATURE_CATALOG["survivability"] ?? {}).find(
      ([, spec]) => spec.direction === "down" && Array.isArray(spec.range),
    )![0];
    const dna = buildPlayerDna([row("m1", { survivability: { [downName]: 0.2 } })]);
    const dim = dna.dimensions.find((d) => d.dimension === "survivability")!;
    expect(dim.value).toBeCloseTo(0.8);
    for (const d of dna.dimensions)
      for (const s of d.signals)
        if (s.direction === "neutral") expect(s.foldedIntoDimension).toBe(false);
  });

  it("a dimension with no observed signal has no value", () => {
    const dna = buildPlayerDna([row("m1", { aim: { hs_rate: 0.5 } })]);
    expect(dna.dimensions.find((d) => d.dimension === "economy")!.value).toBeNull();
  });

  it("the server function reads only the caller's own features with the caller's session", () => {
    const source = readFileSync(resolve("src/lib/playerData.functions.ts"), "utf8");
    const fn = source.slice(source.indexOf("export const getRealPlayerDna"));
    expect(fn).toContain(".middleware([requireSupabaseAuth])");
    expect(fn).toContain('.eq("user_id", context.userId)');
    expect(fn).toContain('.from("match_features")');
    expect(fn).toContain('.in("player_id", playerIds)');
    const page = readFileSync(resolve("src/components/real/RealDna.tsx"), "utf8");
    expect(page).not.toMatch(/@\/data\/|playerService|demoPlayer/);
    expect(page).toContain("showAverage={false}");
  });
});

import { describe, expect, it } from "vitest";

import { computeMetrics } from "@/lib/pipeline/metrics";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import type { RawParserOutput } from "@/lib/pipeline/types";

import { ME, syntheticParserOutput } from "./fixture";

/** UX-1.0 enemy-hp-v1 in the ingestion path: same pure function, coverage rules. */
describe("enemy-hp-v1 in computeMetrics", () => {
  it("is computed on a complete extraction, capped below the historical adr", () => {
    const m = computeMetrics(normalizeParserOutput(structuredClone(syntheticParserOutput)), ME);
    expect(m.adr).not.toBeNull();
    expect(m.damageEnemyHp).not.toBeNull();
    expect(m.damageEnemyHpExcludedHits).not.toBeNull();
    // Enemy health removed can never exceed every dmg_health the player dealt.
    expect(m.adrEnemyHp!).toBeLessThanOrEqual(m.adr!);
  });

  it("is UNAVAILABLE (null) on a partial extraction — never a partial number shown as complete", () => {
    const raw = structuredClone(syntheticParserOutput) as RawParserOutput;
    (raw as unknown as { warnings: string[] }).warnings = ["partial parse: round 3 truncated"];
    const m = computeMetrics(normalizeParserOutput(raw), ME);
    expect(m.damageEnemyHp).toBeNull();
    expect(m.adrEnemyHp).toBeNull();
    expect(m.damageEnemyHpMethod).toBeNull();
    expect(m.damageEnemyHpExcludedHits).toBeNull();
  });
});

/**
 * Fase 4.2 — 4.2.1: the specification's taxonomy and envelope (`metric-contract-v1`) and the
 * release matrix. Null is never zero; a valued status needs a value; a percentage needs a
 * denominator; every metric the product shows and every metric the 4.2 table proposes has a
 * release decision with evidence.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { observe } from "@/lib/diagnostics/xray";
import { CANONICAL_METRICS, UNSUPPORTED_CAPABILITIES } from "@/lib/metrics/canonicalMetrics";
import {
  envelope,
  fromObservation,
  METRIC_CONTRACT_VERSION,
  METRIC_STATUSES,
  MetricEnvelopeError,
  RELEASE_MATRIX,
  releaseEntry,
} from "@/lib/metrics/metricContract";
import type { OverviewMatch } from "@/lib/playerOverview";

const spec = readFileSync(
  resolve(
    process.cwd(),
    "docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre.md",
  ),
  "utf8",
);
const base = {
  metric_key: "x",
  unit: "count",
  provenance_method: "test",
  sample_size: { n: 3, unit: "matches" },
  coverage: null,
  evidence_refs: [],
};

describe("taxonomy", () => {
  it("is exactly the specification's §4 states, in order", () => {
    const table = spec.slice(
      spec.indexOf("# 4. Contratos, proveniência e qualidade"),
      spec.indexOf("Manter compatibilidade com coach-context-v1"),
    );
    const states = [...table.matchAll(/^\| ([A-Z_]+) \|/gm)].map((m) => m[1]);
    expect(states).toEqual([...METRIC_STATUSES]);
  });
});

describe("envelope invariants", () => {
  it("valued statuses need a finite value; others must be null (null ≠ 0)", () => {
    expect(envelope({ ...base, status: "OBSERVED", value: 0 }).value).toBe(0); // a real zero stays zero
    expect(() => envelope({ ...base, status: "OBSERVED", value: null })).toThrow(
      MetricEnvelopeError,
    );
    expect(() => envelope({ ...base, status: "DERIVED", value: Number.NaN })).toThrow(
      MetricEnvelopeError,
    );
    for (const status of [
      "NOT_OBSERVED",
      "NOT_MEASURED",
      "INSUFFICIENT_SAMPLE",
      "UNAVAILABLE",
    ] as const) {
      expect(envelope({ ...base, status, value: null }).value).toBeNull();
      expect(() => envelope({ ...base, status, value: 0 }), status).toThrow(
        /value_without_measure/,
      );
    }
  });

  it("a percentage needs a positive denominator", () => {
    expect(() =>
      envelope({ ...base, unit: "percent", status: "DERIVED", value: 50, sample_size: null }),
    ).toThrow(/percent_without_denominator/);
    expect(() =>
      envelope({
        ...base,
        unit: "percent",
        status: "DERIVED",
        value: 50,
        sample_size: { n: 0, unit: "rounds" },
      }),
    ).toThrow(/percent_without_denominator/);
    expect(
      envelope({
        ...base,
        unit: "percent",
        status: "DERIVED",
        value: 50,
        sample_size: { n: 8, unit: "rounds" },
      }).value,
    ).toBe(50);
  });

  it("coverage cannot exceed what is eligible; unknown status rejected; never a confidence", () => {
    expect(() =>
      envelope({ ...base, status: "OBSERVED", value: 1, coverage: { measured: 9, eligible: 8 } }),
    ).toThrow(/coverage_out_of_range/);
    expect(() => envelope({ ...base, status: "MEASURED" as never, value: 1 })).toThrow(
      /unknown_status/,
    );
    const e = envelope({ ...base, status: "OBSERVED", value: 1 });
    expect(e).toMatchObject({ confidence: null, schema_version: METRIC_CONTRACT_VERSION });
  });
});

describe("adapter from xray-v1 observations (no field renamed, no value changed)", () => {
  const m = (o: Partial<OverviewMatch>): OverviewMatch =>
    ({
      kills: 10,
      deaths: 5,
      result: null,
      resultStatus: "UNRESOLVED_BY_DEMO",
      adr: 80,
      ...o,
    }) as unknown as OverviewMatch;

  it("counts → OBSERVED, ratios → DERIVED with numerator/denominator", () => {
    const kd = fromObservation(observe([m({}), m({ kills: 6, deaths: 5 })], "kd"));
    expect(kd).toMatchObject({
      metric_key: "match.kd",
      status: "DERIVED",
      value: 1.6,
      sample_size: { n: 10 },
    });
    const kills = fromObservation(observe([m({})], "kills"));
    expect(kills.status).toBe("OBSERVED");
  });

  it("not measured stays NOT_MEASURED with null; excluded by admission is UNAVAILABLE", () => {
    const none = fromObservation(observe([m({ kills: null, deaths: null })], "kd"));
    expect(none).toMatchObject({ status: "NOT_MEASURED", value: null });
    const win = fromObservation(observe([m({})], "winRate"));
    expect(win).toMatchObject({ status: "UNAVAILABLE", value: null });
  });
});

describe("release matrix", () => {
  it("covers every metric the product shows today", () => {
    for (const c of CANONICAL_METRICS) expect(releaseEntry(`match.${c.id}`), c.id).toBeDefined();
  });

  it("covers every row of the specification's §4 table", () => {
    const domains = [
      "spatial.death_heatmap",
      "spatial.kill_heatmap",
      "spatial.density",
      "combat.duels_by_weapon_distance",
      "aim.first_bullet",
      "movement.counter_strafe",
      "aim.crosshair_placement",
      "utility.flash_affected",
      "utility.flash_assist",
      "economy.equipment_value",
      "impact.trade",
      "evolution.trend",
      "pro.benchmark",
    ];
    for (const d of domains) expect(releaseEntry(d), d).toBeDefined();
  });

  it("every non-SUPPORTED entry names a blocker; every entry has evidence; keys unique", () => {
    for (const e of RELEASE_MATRIX) {
      expect(e.evidence.length, e.metric_key).toBeGreaterThan(5);
      if (e.release !== "SUPPORTED") expect(e.blockers.length, e.metric_key).toBeGreaterThan(0);
      else expect(e.blockers, e.metric_key).toEqual([]);
    }
    expect(new Set(RELEASE_MATRIX.map((e) => e.metric_key)).size).toBe(RELEASE_MATRIX.length);
  });

  it("what the admission contract forbids is never SUPPORTED", () => {
    for (const e of RELEASE_MATRIX)
      if (
        e.blockers.some(
          (b) => b === "L02_TICK_DOMAIN" || b === "L03_USERCMD" || b === "L04_MATCH_RESULT",
        )
      )
        expect(e.release, e.metric_key).not.toBe("SUPPORTED");
    expect(releaseEntry("pro.benchmark")?.release).toBe("UNAVAILABLE");
    expect(releaseEntry("match.winRate")?.release).toBe("UNAVAILABLE");
  });

  it("each capability the X-ray lists as unsupported has a non-SUPPORTED release entry", () => {
    const map: Record<(typeof UNSUPPORTED_CAPABILITIES)[number], string> = {
      enemiesFlashed: "utility.flash_affected",
      positions: "spatial.death_heatmap",
      economyClassification: "economy.equipment_value",
      sideSplitKills: "round_context.side_kills_damage",
    };
    for (const cap of UNSUPPORTED_CAPABILITIES) {
      const e = releaseEntry(map[cap]);
      expect(e, cap).toBeDefined();
      // sideSplitKills became measurable with round-context-v1 (listed only when no own rounds).
      if (cap !== "sideSplitKills") expect(e!.release, cap).not.toBe("SUPPORTED");
    }
  });
});

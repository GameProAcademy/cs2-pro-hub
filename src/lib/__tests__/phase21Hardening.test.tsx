/**
 * Fase 2.1 — hardening of `xray-v1`, Player DNA, aggregate precision and pure reads.
 *
 * 1. Provisional DNA indexes never leave the contract (index null unless READY).
 * 2. The Dashboard DNA summary is a pure read of the persisted snapshot.
 * 3. One deterministic rounding rule (decimal half-up), on the aggregate only.
 * 4. HS% scenario of the audit: 0/2 and 5/18 → 13.9 (mean of matches), 25 only as comparison.
 * 5. Cautious "enemies flashed" copy in 5 locales.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { buildXRay, observe } from "@/lib/diagnostics/xray";
import { formatNumber } from "@/lib/format";
import { CANONICAL_METRICS, canonicalMetric } from "@/lib/metrics/canonicalMetrics";
import { roundHalfUp } from "@/lib/metrics/rounding";
import { buildPlayerDna, publishableDna, type RealPlayerDna } from "@/lib/playerDna";
import {
  aggregate,
  shapeMatches,
  type OverviewMatch,
  type OverviewMatchRow,
  type OverviewMetricRow,
  type PlayerOverview,
} from "@/lib/playerOverview";
import { dnaSummaryFrom, loadDnaSummary } from "@/lib/xray.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { XRayBody } = await import("@/components/real/RealXRay");
const { DnaBody, DnaSummaryBody } = await import("@/components/real/RealDna");

const read = (p: string) => readFileSync(resolve(p), "utf8");
const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const L04 = [
  "L01-CAPABILITY-SURFACE-UNENUMERABLE",
  "L02-TICK-DOMAIN-AUTHORITY-UNAVAILABLE",
  "L03-USERCMD-UNAVAILABLE",
  "L04-MATCH-RESULT-UNRESOLVED",
];

function render(node: React.ReactNode, locale: Locale = "pt-BR") {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}

function m(over: Partial<OverviewMatch> = {}): OverviewMatch {
  return {
    matchId: "nuke",
    map: "de_nuke",
    playedAt: "2026-11-03T05:35:03Z",
    dateSource: "processed",
    resultStatus: "UNRESOLVED_BY_DEMO",
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    source: "demo",
    kills: 18,
    deaths: 10,
    assists: 4,
    adr: 117.6,
    kast: 84.2,
    hsPercent: 27.8,
    rating: 1.13,
    firstKills: 3,
    firstDeaths: 0,
    tradeKills: 3,
    flashAssists: 0,
    utilityDamage: 38,
    clutchAttempts: 1,
    clutchWins: 1,
    ctRating: 0.78,
    tRating: 1.72,
    roundsPlayed: 19,
    admission: "LIMITED",
    limitations: L04,
    ...over,
  };
}
const ancient = (over: Partial<OverviewMatch> = {}) =>
  m({
    matchId: "ancient",
    map: "de_ancient",
    kills: 2,
    deaths: 13,
    adr: 34.4,
    kast: 40,
    hsPercent: 0,
    rating: 0.18,
    firstKills: 1,
    tradeKills: 0,
    utilityDamage: 71,
    clutchAttempts: null,
    clutchWins: null,
    ctRating: 0.2,
    tRating: 0.08,
    roundsPlayed: 15,
    ...over,
  });

function overview(matches: OverviewMatch[]): PlayerOverview {
  return {
    state: "READY",
    generatedAt: "2026-11-04T00:00:00Z",
    counts: {
      total: matches.length,
      inFlight: 0,
      processed: matches.length,
      failed: 0,
      blocked: 0,
      cancelled: 0,
      identityPending: 0,
    },
    latestJobs: [],
    matches,
    aggregates: aggregate(matches),
  };
}

const VALUES: Record<string, number | null> = {
  aim: 0.45,
  dueling: 0.69,
  survivability: 0.52,
  positioning: 0.71,
  utility: 0.27,
  decision_making: 0.87,
  teamplay: 0.24,
  economy: null,
  clutch: 0.57,
  consistency: 0.44,
};
function dna(state: RealPlayerDna["state"], values = VALUES): RealPlayerDna {
  return {
    state,
    matches: state === "READY" ? 3 : 2,
    rounds: 34,
    partialMatches: 0,
    minimumMatches: 3,
    dimensions: Object.entries(values).map(([dimension, value]) => ({
      dimension: dimension as never,
      value,
      signals: [
        {
          name: "kills_per_round",
          mean: value,
          matches: value === null ? 0 : 2,
          unit: "ratio",
          direction: "up",
          foldedIntoDimension: true,
        },
      ],
    })),
  };
}

describe("1. provisional DNA indexes never leave the contract", () => {
  it("2 of 3 matches: IN_FORMATION, every index null, no inference, no recommendation", () => {
    const x = buildXRay({
      overview: overview([m(), ancient()]),
      dna: dna("INSUFFICIENT_SAMPLE"),
      sides: [],
    });
    expect(x.state).toBe("IN_FORMATION");
    const readings = x.dimensions.flatMap((d) => d.dna);
    expect(readings.length).toBe(10);
    expect(readings.every((r) => r.index === null)).toBe(true);
    expect(readings.filter((r) => r.indexStatus === "IN_FORMATION").length).toBe(9);
    expect(readings.find((r) => r.dimension === "economy")!.indexStatus).toBe("NOT_OBSERVED");
    expect(x.inferences).toEqual([]);
    expect(x.recommendations).toEqual([]);
    expect(x.inferenceBlockedBy).toBe("INSUFFICIENT_SAMPLE");
    // Observed-but-withheld dimensions still count as observed, never as missing.
    expect(x.dimensions.find((d) => d.id === "decision")!.status).toBe("OBSERVED");
  });

  it("serialized xray-v1 carries no numeric DNA index while in formation", () => {
    const json = JSON.stringify(
      buildXRay({
        overview: overview([m(), ancient()]),
        dna: dna("INSUFFICIENT_SAMPLE"),
        sides: [],
      }),
    );
    expect(json).not.toMatch(/"index":\s*-?\d/);
    expect(json).toContain('"indexStatus":"IN_FORMATION"');
  });

  it("READY: indexes are published and unobserved stays null, never 0", () => {
    const x = buildXRay({ overview: overview([m(), ancient()]), dna: dna("READY"), sides: [] });
    const r = Object.fromEntries(x.dimensions.flatMap((d) => d.dna).map((d) => [d.dimension, d]));
    expect(r["aim"]).toMatchObject({ index: 45, indexStatus: "READY" });
    expect(r["utility"]).toMatchObject({ index: 27, indexStatus: "READY" });
    expect(r["economy"]).toMatchObject({ index: null, indexStatus: "NOT_OBSERVED" });
    expect(x.inferences.map((i) => i.dimension)).toEqual(["teamplay", "utility", "consistency"]);
  });

  it("partial or repeated rows cannot raise the DNA state", () => {
    const row = (id: string, partial: boolean) => ({
      match_id: id,
      partial_parse: partial,
      sample_rounds: 15,
      features: { aim: { kills_per_round: 0.5 } },
    });
    const two = buildPlayerDna([row("a", false), row("a", true), row("b", true), row("b", false)]);
    expect(two.matches).toBe(2);
    expect(two.state).toBe("INSUFFICIENT_SAMPLE");
    expect(two.partialMatches).toBe(2);
  });

  it("the Player DNA payload withholds provisional dimension values", () => {
    const pub = publishableDna(dna("INSUFFICIENT_SAMPLE"));
    expect(pub.dimensions.every((d) => d.value === null)).toBe(true);
    expect(pub.dimensions.filter((d) => d.observed).length).toBe(9);
    expect(pub.dimensions.find((d) => d.dimension === "economy")!.observed).toBe(false);
    // Signals are real measurements with their sample and stay.
    expect(pub.dimensions.find((d) => d.dimension === "aim")!.signals[0]!.mean).toBe(0.45);
    const ready = publishableDna(dna("READY"));
    expect(ready.dimensions.find((d) => d.dimension === "aim")!.value).toBe(0.45);
    expect(read("src/lib/playerData.functions.ts")).toContain(
      "const dna = publishableDna(computed);",
    );
  });

  it("the Player DNA page shows 'in formation' and no score; the X-ray too", () => {
    const page = render(<DnaBody dna={publishableDna(dna("INSUFFICIENT_SAMPLE"))} />);
    expect(page).toContain("Índice em formação (2 de 3 partidas)");
    expect(page).toContain("Não observado");
    expect(page).not.toMatch(/>\d+(<!-- -->)? \/ 100</);
    const xray = render(
      <XRayBody
        x={buildXRay({
          overview: overview([m(), ancient()]),
          dna: dna("INSUFFICIENT_SAMPLE"),
          sides: [],
        })}
      />,
    );
    expect(xray).toContain('data-dna-index-status="IN_FORMATION"');
    expect(xray).not.toContain('data-dna-index-status="READY"');
    const ready = render(
      <XRayBody
        x={buildXRay({ overview: overview([m(), ancient()]), dna: dna("READY"), sides: [] })}
      />,
    );
    expect(ready).toContain('data-dna-index-status="READY"');
    expect(ready).toMatch(/45(<!-- -->)? \/ 100/);
  });
});

describe("2. the Dashboard DNA summary is a pure read", () => {
  type Call = { table?: string; method: string; args: unknown[] };
  function recordingClient(opts: {
    players: string[];
    rows?: Array<Record<string, unknown>>;
    error?: { code: string };
  }) {
    const calls: Call[] = [];
    const chain = (table: string) => {
      const q: Record<string, unknown> = {};
      const result = () =>
        table === "player_profiles"
          ? { data: opts.players.map((id) => ({ id })), error: null }
          : { data: opts.error ? null : (opts.rows ?? []), error: opts.error ?? null };
      for (const method of [
        "select",
        "eq",
        "order",
        "limit",
        "in",
        "insert",
        "update",
        "upsert",
        "delete",
        "rpc",
      ])
        q[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return q;
        };
      q["then"] = (resolveFn: (v: unknown) => unknown) => resolveFn(result());
      return q;
    };
    const client = {
      from: (table: string) => {
        calls.push({ table, method: "from", args: [table] });
        return chain(table);
      },
      rpc: (...args: unknown[]) => {
        calls.push({ method: "rpc", args });
        return Promise.resolve({ data: null, error: null });
      },
    };
    return { client: client as never, calls };
  }
  const WRITES = ["insert", "update", "upsert", "delete", "rpc"];

  it("reads only the caller's own latest snapshot and writes nothing", async () => {
    const { client, calls } = recordingClient({
      players: ["p-own"],
      rows: [
        {
          created_at: "2026-11-04T00:09:00Z",
          state: "INSUFFICIENT_SAMPLE",
          match_count: 2,
          aim: 45,
          economy: null,
        },
      ],
    });
    const summary = await loadDnaSummary(client, "user-1");
    expect(summary).toMatchObject({
      state: "INSUFFICIENT_SAMPLE",
      matches: 2,
      minimumMatches: 3,
      observedDimensions: 1,
    });
    expect(calls.filter((c) => WRITES.includes(c.method))).toEqual([]);
    expect(calls).toContainEqual({
      table: "player_profiles",
      method: "eq",
      args: ["user_id", "user-1"],
    });
    expect(calls).toContainEqual({
      table: "player_dna_snapshots",
      method: "eq",
      args: ["player_id", "p-own"],
    });
    expect(calls.filter((c) => c.method === "from").map((c) => c.table)).toEqual([
      "player_profiles",
      "player_dna_snapshots",
    ]);
  });

  it("different users read different players (scope comes from the session user)", async () => {
    const a = recordingClient({ players: ["p-a"], rows: [] });
    const b = recordingClient({ players: ["p-b"], rows: [] });
    await loadDnaSummary(a.client, "user-a");
    await loadDnaSummary(b.client, "user-b");
    expect(a.calls).toContainEqual({
      table: "player_dna_snapshots",
      method: "eq",
      args: ["player_id", "p-a"],
    });
    expect(b.calls).toContainEqual({
      table: "player_dna_snapshots",
      method: "eq",
      args: ["player_id", "p-b"],
    });
    expect(JSON.stringify(a.calls)).not.toContain("p-b");
  });

  it("no snapshot is reported as such, with no invented values and no write", async () => {
    const { client, calls } = recordingClient({ players: ["p"], rows: [] });
    expect(await loadDnaSummary(client, "u")).toEqual({
      state: "NO_SNAPSHOT",
      matches: null,
      minimumMatches: 3,
      observedDimensions: null,
      createdAt: null,
    });
    expect(calls.filter((c) => WRITES.includes(c.method))).toEqual([]);
    expect(dnaSummaryFrom({ state: "SOMETHING_NEW", match_count: 9 }).state).toBe("NO_SNAPSHOT");
  });

  it("a failed read throws and never falls back to a write", async () => {
    const { client, calls } = recordingClient({ players: ["p"], error: { code: "42501" } });
    await expect(loadDnaSummary(client, "u")).rejects.toThrow("DNA_SUMMARY_FAILED:42501");
    expect(calls.filter((c) => WRITES.includes(c.method))).toEqual([]);
  });

  it("architecture: only the Player DNA page calls the snapshot-refreshing read", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const f = join(dir, n);
        if (statSync(f).isDirectory()) {
          if (n !== "__tests__") walk(f);
        } else if (/\.(ts|tsx)$/.test(n)) files.push(f);
      }
    };
    walk("src");
    const callers = files.filter((f) => /getRealPlayerDna\(\)/.test(read(f)));
    expect(callers).toEqual(["src/components/real/RealDna.tsx"]);
    const dnaFile = read("src/components/real/RealDna.tsx");
    const summary = dnaFile.slice(
      dnaFile.indexOf("export function RealDnaSummary"),
      dnaFile.indexOf("export function DnaSummaryBody"),
    );
    expect(summary).toContain("getDnaSummary()");
    expect(summary).not.toContain("getRealPlayerDna");
    expect((dnaFile.match(/getRealPlayerDna\(\)/g) ?? []).length).toBe(1);
    const xrayFns = read("src/lib/xray.functions.ts");
    expect(xrayFns).not.toMatch(
      /playerDnaSnapshot|refresh\w*Snapshot|\.(insert|update|upsert|delete|rpc)\(/,
    );
    expect(read("src/routes/_authenticated/dashboard.tsx")).not.toContain("getRealPlayerDna");
  });

  it("the summary card renders each state without inventing values", () => {
    const html = render(
      <DnaSummaryBody text="Ainda não há um perfil do Player DNA salvo." state="NO_SNAPSHOT" />,
    );
    expect(html).toContain('data-dna-summary="NO_SNAPSHOT"');
    expect(html).not.toMatch(/>0</);
  });
});

describe("3. deterministic rounding, on the aggregate", () => {
  it("decimal half-up, sign-symmetric, repeatable", () => {
    const cases: Array<[number, number, number]> = [
      [0.6549999999999999, 3, 0.655],
      [(0.78 + 0.53) / 2, 3, 0.655],
      [(1.13 + 0.18) / 2, 2, 0.66],
      [1.005, 2, 1.01],
      [2.675, 2, 2.68],
      [-0.655, 2, -0.66],
      [13.888888888888889, 1, 13.9],
      [0.0004, 3, 0],
      [-0.0004, 3, 0],
      [123456.785, 2, 123456.79],
    ];
    for (const [v, d, want] of cases) {
      for (let i = 0; i < 3; i++) expect(roundHalfUp(v, d)).toBe(want);
    }
    expect(Object.is(roundHalfUp(-0.0004, 3), -0)).toBe(false);
    expect(Number.isNaN(roundHalfUp(Number.NaN, 2))).toBe(true);
    expect(() => roundHalfUp(1, -1)).toThrow();
  });

  it("display formatting rounds the decimal value, per locale", () => {
    expect(formatNumber(0.6549999999999999, "pt-BR", 2)).toBe("0,66");
    expect(formatNumber(0.6549999999999999, "en-US", 2)).toBe("0.66");
    expect(formatNumber(1.005, "fr-FR", 2)).toBe("1,01");
    expect(formatNumber(null, "pt-BR", 2)).toBe("—");
  });

  it("every catalogued metric declares contract and display precision", () => {
    for (const c of CANONICAL_METRICS) {
      expect(c.digits.contract, c.id).toBeGreaterThanOrEqual(c.digits.display);
      expect(Number.isInteger(c.digits.contract) && Number.isInteger(c.digits.display)).toBe(true);
    }
  });

  it("the rating mean of the audit is 0.655 in the contract and 0,66 on screen", () => {
    const o = observe([m({ rating: 1.13 }), ancient({ rating: 0.18 })], "rating");
    expect(o.value).toBe(0.655);
    const o2 = observe([m({ rating: 0.78 }), ancient({ rating: 0.53 })], "rating");
    expect(o2.value).toBe(0.655);
    expect(formatNumber(o.value, "pt-BR", canonicalMetric("rating").digits.display)).toBe("0,66");
    const html = render(
      <XRayBody
        x={buildXRay({
          overview: overview([m(), ancient()]),
          dna: dna("INSUFFICIENT_SAMPLE"),
          sides: [],
        })}
      />,
    );
    expect(html).toContain("0,66");
    expect(html).not.toContain("0,65<");
  });

  it("K/D keeps numerator and denominator; only the value is rounded", () => {
    const o = observe([m(), ancient()], "kd");
    expect(o).toMatchObject({ value: 0.87, numerator: 20, denominator: 23 });
    expect(canonicalMetric("kd").digits.contract).toBe(3);
  });
});

describe("4. HS% — the audited scenario", () => {
  const metric = (id: string, kills: number, hs: string | null): OverviewMetricRow => ({
    match_id: id,
    kills,
    deaths: 1,
    assists: 0,
    adr: "1",
    kast: "1",
    hs_percent: hs,
    rating: "1",
    rounds_played: 1,
  });
  const row = (id: string): OverviewMatchRow => ({
    id,
    map: "de_x",
    played_at: null,
    match_date: null,
    created_at: "2026-11-03T00:00:00Z",
    result: null,
    score_player: null,
    score_opponent: null,
    data_source: "demo",
  });

  it("per match: 5/18 → 27.8 and 0/2 → 0, on the 0–100 scale", () => {
    expect(roundHalfUp((5 / 18) * 100, 1)).toBe(27.8);
    expect(roundHalfUp((0 / 2) * 100, 1)).toBe(0);
    expect(canonicalMetric("hsPercent")).toMatchObject({
      unit: "percent",
      aggregation: "mean_of_matches",
    });
    // The engine persists exactly this formula (round1, ×100 once).
    expect(read("src/lib/pipeline/metrics.ts")).toContain(
      "hsPercent: playerKills.length > 0 ? round1((headshots / playerKills.length) * 100) : null,",
    );
  });

  it("integration: persisted rows → overview → contract = 13.9 over 2 matches", () => {
    const shaped = shapeMatches(
      [metric("nuke", 18, "27.80"), metric("ancient", 2, "0.00")],
      [row("nuke"), row("ancient")],
    );
    expect(aggregate(shaped)!.hsPercent).toBeCloseTo(13.9, 10);
    const o = observe(shaped, "hsPercent");
    expect(o).toMatchObject({
      status: "MEASURED",
      value: 13.9,
      matches: 2,
      numerator: null,
      denominator: null,
    });
    expect(o.value).not.toBe(1390);
    // Comparison only (not the canonical rule): pooled 5 / 20 = 25 %.
    const pooled = ((0.278 * 18 + 0 * 2) / 20) * 100;
    expect(roundHalfUp(pooled, 0)).toBe(25);
    expect(o.value).not.toBe(25);
  });

  it("a match without HS (no kills) is excluded, not counted as 0", () => {
    const shaped = shapeMatches(
      [metric("nuke", 18, "27.80"), metric("ancient", 2, "0.00"), metric("empty", 0, null)],
      [row("nuke"), row("ancient"), row("empty")],
    );
    expect(observe(shaped, "hsPercent")).toMatchObject({ value: 13.9, matches: 2 });
    expect(observe([m({ hsPercent: null })], "hsPercent")).toMatchObject({
      status: "NOT_MEASURED",
      value: null,
      matches: 0,
    });
    expect(observe([ancient()], "hsPercent")).toMatchObject({ status: "MEASURED", value: 0 });
  });

  it("presentation: the X-ray shows 13,9% (pt) / 13.9% (en), never 36,1% or 1390", () => {
    const x = buildXRay({
      overview: overview([m(), ancient()]),
      dna: dna("INSUFFICIENT_SAMPLE"),
      sides: [],
    });
    const pt = render(<XRayBody x={x} />);
    expect(pt).toMatch(/13,9<!-- -->%/);
    expect(pt).not.toContain("36,1");
    expect(pt).not.toContain("1390");
    expect(render(<XRayBody x={x} />, "en")).toMatch(/13\.9<!-- -->%/);
  });
});

describe("5. enemies flashed copy is limited to the evidence", () => {
  it("no locale claims that demos never record who was blinded", () => {
    const general =
      /demos? (não|nao) (trazem|indicam)|demos do not record|demos no registran|démos n.enregistrent pas/i;
    for (const locale of LOCALES) {
      const text = (dictionaries[locale] as Record<string, string>)[
        "xray.unsupported.enemiesFlashed"
      ]!;
      expect(text, locale).not.toMatch(general);
    }
    expect(dictionaries["pt-BR"]["xray.unsupported.enemiesFlashed" as never]).toContain(
      "nestas partidas",
    );
    expect(dictionaries["en"]["xray.unsupported.enemiesFlashed" as never]).toContain(
      "in these matches",
    );
  });

  it("the new summary state is translated in the 5 locales", () => {
    for (const locale of LOCALES)
      expect(
        (dictionaries[locale] as Record<string, string>)["real.dna.dashboard.noSnapshot"]?.length,
      ).toBeGreaterThan(10);
  });
});

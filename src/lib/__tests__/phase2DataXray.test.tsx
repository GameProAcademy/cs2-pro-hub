/**
 * Fase 2 — dados e Raio-X: canonical metrics catalog, result/date provenance, the `xray-v1`
 * diagnosis contract (observation / inference / recommendation), Player DNA "in formation",
 * RLS-scoped reads and the UI that renders them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { xrayPtBR } from "@/i18n/locales/xray/pt-BR";
import { DIMENSION_TOPICS } from "@/lib/catalog/catalogSelect";
import { buildXRay, observe, XRAY_CONTRACT_VERSION } from "@/lib/diagnostics/xray";
import { formatSignalValue } from "@/lib/dnaFormat";
import { METRIC_IDS } from "@/lib/glossary";
import { CANONICAL_METRICS } from "@/lib/metrics/canonicalMetrics";
import {
  METRIC_DATA_DEPENDENCIES_V3,
  PROJECTION_DATA_DEPENDENCIES_V3,
} from "@/lib/pipeline/admissionV3";
import type { RealPlayerDna } from "@/lib/playerDna";
import {
  aggregate,
  shapeMatches,
  type OverviewJobRow,
  type OverviewMatch,
  type OverviewMetricRow,
  type OverviewMatchRow,
  type PlayerOverview,
} from "@/lib/playerOverview";
import { buildTrainingPlan, PLAN_CEILING } from "@/lib/training/trainingPlan";
import { sideRoundsFrom } from "@/lib/xray.functions";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { RealAggregates, RealMatchesTable } = await import("@/components/real/RealData");
const { XRayBody } = await import("@/components/real/RealXRay");

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
    matchId: "m1",
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
    assists: 3,
    adr: 117.6,
    kast: 84.2,
    hsPercent: 22.2,
    rating: 1.13,
    firstKills: 3,
    firstDeaths: 0,
    tradeKills: 2,
    flashAssists: 0,
    utilityDamage: 40,
    clutchAttempts: 1,
    clutchWins: 1,
    ctRating: 1.2,
    tRating: 1.0,
    roundsPlayed: 19,
    admission: "LIMITED",
    limitations: L04,
    ...over,
  };
}

function overview(matches: OverviewMatch[]): PlayerOverview {
  return {
    state: matches.length ? "READY" : "EMPTY",
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

function dna(state: RealPlayerDna["state"], values: Record<string, number | null>): RealPlayerDna {
  return {
    state,
    matches: state === "READY" ? 4 : 2,
    rounds: 60,
    partialMatches: 0,
    minimumMatches: 3,
    dimensions: Object.entries(values).map(([dimension, value]) => ({
      dimension: dimension as never,
      value,
      signals: [
        {
          name: "s",
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

describe("canonical metrics catalog", () => {
  it("ids are unique and every glossary reference exists", () => {
    const ids = CANONICAL_METRICS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CANONICAL_METRICS)
      if (c.glossary) expect(METRIC_IDS as readonly string[]).toContain(c.glossary);
  });

  it("data classes are exactly the admission v3 dependency maps", () => {
    for (const c of CANONICAL_METRICS) {
      const [table, column] = c.source.split(".") as [string, string];
      const expected =
        table === "match_metrics"
          ? METRIC_DATA_DEPENDENCIES_V3[column]
          : (PROJECTION_DATA_DEPENDENCIES_V3 as Record<string, readonly string[]>)[
              `matches.${column}`
            ];
      expect(expected, c.id).toBeDefined();
      expect([...c.dataClasses]).toEqual([...expected!]);
    }
  });

  it("every source column is read by the app and written by the pipeline", () => {
    const loader = read("src/lib/playerData.functions.ts");
    const persisted = read("src/lib/pipeline/persistence.server.ts");
    for (const c of CANONICAL_METRICS) {
      const column = c.source.split(".")[1]!;
      expect(loader, c.source).toMatch(new RegExp(`\\b${column}\\b`));
      expect(persisted, c.source).toMatch(new RegExp(`\\b${column}:`));
    }
  });

  it("every metric the X-ray observes is catalogued", () => {
    const src = read("src/lib/diagnostics/xray.ts");
    const used = [...src.matchAll(/metrics: \[([^\]]*)\]/g)].flatMap((x) =>
      [...x[1]!.matchAll(/"(\w+)"/g)].map((y) => y[1]!),
    );
    expect(used.length).toBeGreaterThan(8);
    const ids = new Set(CANONICAL_METRICS.map((c) => c.id));
    expect(used.filter((u) => !ids.has(u))).toEqual([]);
  });
});

describe("result and date provenance", () => {
  const metric: OverviewMetricRow = {
    match_id: "x",
    kills: 2,
    deaths: 13,
    assists: 1,
    adr: "34.4",
    kast: "40",
    hs_percent: "50",
    rating: "0.18",
    rounds_played: 15,
  };
  const row = (over: Partial<OverviewMatchRow>): OverviewMatchRow => ({
    id: "x",
    map: "de_ancient",
    played_at: null,
    match_date: null,
    created_at: "2026-11-03T23:31:36Z",
    result: null,
    score_player: null,
    score_opponent: null,
    data_source: "demo",
    ...over,
  });
  const job = (limitations: string[]): OverviewJobRow => ({
    id: "j",
    upload_id: "u",
    status: "processed",
    queued_at: "2026-11-03T23:00:00Z",
    finished_at: null,
    error_code: null,
    attachment_state: "attached",
    attachment_confirmation_status: "user_confirmed",
    match_id: "x",
    admission_verdict: "LIMITED",
    admission_limitations: limitations,
  });

  it("a match without its own date says the date is the processing date", () => {
    const [a] = shapeMatches([metric], [row({})], [job(L04)]);
    expect(a!.dateSource).toBe("processed");
    expect(a!.playedAt).toBe("2026-11-03T23:31:36Z");
    const [b] = shapeMatches([metric], [row({ played_at: "2026-11-01T20:00:00Z" })], []);
    expect(b!.dateSource).toBe("played");
  });

  it("L04 is an unresolved result, never a loss, and never in the win-rate denominator", () => {
    const [a] = shapeMatches([metric], [row({})], [job(L04)]);
    expect(a!.resultStatus).toBe("UNRESOLVED_BY_DEMO");
    const [b] = shapeMatches([metric], [row({})], []);
    expect(b!.resultStatus).toBe("UNKNOWN");
    const [c] = shapeMatches([metric], [row({ result: "loss" })], [job(L04)]);
    expect(c!.resultStatus).toBe("KNOWN");
    const agg = aggregate([a!, m({ matchId: "w", result: "win", resultStatus: "KNOWN" })])!;
    expect(agg).toMatchObject({ wins: 1, decided: 1, resultUnresolved: 1 });
  });

  it("the cards show the win-rate sample or why there is none", () => {
    const unresolved = render(<RealAggregates overview={overview([m(), m({ matchId: "m2" })])} />);
    expect(unresolved).toContain("Nenhuma das 2 partida(s) tem resultado determinado pela demo");
    const known = render(
      <RealAggregates
        overview={overview([
          m({ result: "win", resultStatus: "KNOWN" }),
          m({ matchId: "m2", result: "loss", resultStatus: "KNOWN" }),
          m({ matchId: "m3" }),
        ])}
      />,
    );
    expect(known).toContain("1 de 2 partida(s) com resultado");
  });

  it("the table explains processed dates and unresolved results", () => {
    const html = render(<RealMatchesTable rows={[m()]} />);
    expect(html).toContain('data-date-source="processed"');
    expect(html).toContain('class="sr-only">Não determinado pela demo');
    expect(html).toContain("data-match-notes");
    expect(html).toContain("limitação L04");
    const clean = render(
      <RealMatchesTable
        rows={[m({ dateSource: "played", resultStatus: "KNOWN", result: "win" })]}
      />,
    );
    expect(clean).not.toContain("data-match-notes");
  });
});

describe("xray-v1 observations: null, excluded and zero are distinct", () => {
  it("a measured zero is MEASURED 0", () => {
    const o = observe([m({ flashAssists: 0 })], "flashAssists");
    expect(o).toMatchObject({ status: "MEASURED", value: 0, matches: 1 });
  });

  it("no value is NOT_MEASURED with no value, and means skip missing matches", () => {
    expect(observe([m({ adr: null })], "adr")).toMatchObject({
      status: "NOT_MEASURED",
      value: null,
      matches: 0,
    });
    const o = observe(
      [m({ adr: 100 }), m({ matchId: "b", adr: null }), m({ matchId: "c", adr: 50 })],
      "adr",
    );
    expect(o).toMatchObject({ status: "MEASURED", value: 75, matches: 2 });
  });

  it("win rate is EXCLUDED_BY_ADMISSION when every match has L04", () => {
    expect(observe([m(), m({ matchId: "b" })], "winRate")).toMatchObject({
      status: "EXCLUDED_BY_ADMISSION",
      value: null,
      numerator: null,
      denominator: null,
    });
  });

  it("K/D carries its numerator and denominator", () => {
    const o = observe([m(), m({ matchId: "b", kills: 2, deaths: 13 })], "kd");
    expect(o).toMatchObject({ status: "MEASURED", numerator: 20, denominator: 23, matches: 2 });
    expect(o.value).toBeCloseTo(20 / 23);
  });

  it("an unregistered limitation never turns a missing value into EXCLUDED", () => {
    expect(observe([m({ adr: null, limitations: ["LXX-FUTURE"] })], "adr").status).toBe(
      "NOT_MEASURED",
    );
  });
});

describe("xray-v1 inference and recommendation", () => {
  const values = {
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

  it("below the DNA minimum there is no inference and no recommendation", () => {
    const x = buildXRay({
      overview: overview([m()]),
      dna: dna("INSUFFICIENT_SAMPLE", values),
      sides: [],
    });
    expect(x.version).toBe(XRAY_CONTRACT_VERSION);
    expect(x.state).toBe("IN_FORMATION");
    expect(x.inferences).toEqual([]);
    expect(x.recommendations).toEqual([]);
    expect(x.inferenceBlockedBy).toBe("INSUFFICIENT_SAMPLE");
  });

  it("with the minimum sample, inferences are the training plan's own priorities", () => {
    const x = buildXRay({ overview: overview([m()]), dna: dna("READY", values), sides: [] });
    const readings = Object.entries(values).map(([dimension, v]) => ({
      dimension,
      index: v === null ? null : Math.round(v * 100),
    }));
    const plan = buildTrainingPlan({
      locale: "pt-BR",
      dataState: "READY",
      dimensions: readings,
      goals: [],
      maps: [],
      candidates: [],
    });
    expect(x.inferences.map((i) => i.dimension)).toEqual(plan.priorities.map((p) => p.dimension));
    expect(x.inferences.map((i) => i.dimension)).toEqual(["teamplay", "utility", "consistency"]);
    expect(x.inferences.every((i) => i.index < PLAN_CEILING && i.ceiling === PLAN_CEILING)).toBe(
      true,
    );
    expect(x.recommendations[0]).toEqual({
      dimension: "teamplay",
      topics: DIMENSION_TOPICS["teamplay"],
      route: "/training",
    });
  });

  it("an unobserved dimension is never a weakness", () => {
    const x = buildXRay({
      overview: overview([m()]),
      dna: dna("READY", { aim: null, utility: 0.9 }),
      sides: [],
    });
    expect(x.inferences).toEqual([]);
    expect(x.inferenceBlockedBy).toBe("NONE_BELOW_CEILING");
  });

  it("side rounds use only complete matches of the player's own participant", () => {
    const keys = new Map([
      ["a", "p1"],
      ["b", "p1"],
    ]);
    const rows = [
      ...Array.from({ length: 12 }, () => ({ match_id: "a", participant_key: "p1", side: "CT" })),
      ...Array.from({ length: 7 }, () => ({ match_id: "a", participant_key: "p1", side: "T" })),
      { match_id: "a", participant_key: "p2", side: "T" },
      { match_id: "b", participant_key: "p1", side: "CT" },
      { match_id: "b", participant_key: "p1", side: null },
    ];
    expect(sideRoundsFrom(rows, keys)).toEqual([{ matchId: "a", ct: 12, t: 7 }]);
    const x = buildXRay({
      overview: overview([m({ matchId: "a" })]),
      dna: dna("INSUFFICIENT_SAMPLE", values),
      sides: sideRoundsFrom(rows, keys),
    });
    expect(x.sides.ct.rounds).toBe(12);
    expect(x.sides.t.rounds).toBe(7);
    expect(x.sides.ct.rating.status).toBe("MEASURED");
  });

  it("the X-ray page separates the three layers and never shows an index in formation", () => {
    const x = buildXRay({
      overview: overview([m()]),
      dna: dna("INSUFFICIENT_SAMPLE", values),
      sides: [],
    });
    const html = render(<XRayBody x={x} />);
    expect(html).toContain('data-xray-version="xray-v1"');
    expect(html).toContain('aria-label="Observado"');
    expect(html).toContain('aria-label="Inferência"');
    expect(html).toContain('aria-label="Recomendação"');
    expect(html).toContain("Raio-X em formação");
    expect(html).toContain("data-xray-inference-blocked");
    expect(html).not.toMatch(/\d+ \/ 100/);
    expect(html).toContain('data-observation-status="EXCLUDED_BY_ADMISSION"');
    const ready = render(
      <XRayBody
        x={buildXRay({ overview: overview([m()]), dna: dna("READY", values), sides: [] })}
      />,
    );
    expect(ready).toContain("data-xray-inferences");
    expect(ready).toContain("Priorizar");
  });
});

describe("Player DNA presentation", () => {
  it("signal values follow the player's locale; the Coach context keeps fixed decimals", () => {
    expect(formatSignalValue("hs_rate", 0.139, "ratio", { yes: "s", no: "n" }, "pt-BR")).toBe(
      "13,9%",
    );
    expect(
      formatSignalValue("kills_per_round", 0.54, "ratio", { yes: "s", no: "n" }, "fr-FR"),
    ).toBe("0,54");
    expect(formatSignalValue("hs_rate", 0.139, "ratio", { yes: "s", no: "n" })).toBe("13.9%");
  });

  it("below the minimum sample the page shows 'in formation' instead of dimension scores", () => {
    const page = read("src/components/real/RealDna.tsx");
    expect(page).toContain('const stable = dna.state === "READY";');
    expect(page).toContain("stable && observed.length >= 3");
    expect(page).toContain('t("real.dna.inFormationIndex")');
    expect(page).toContain("<DnaHistory />");
  });

  it("the Dashboard shows the real DNA state instead of 'not available'", () => {
    const dash = read("src/routes/_authenticated/dashboard.tsx");
    expect(dash).toContain("<RealDnaSummary />");
    expect(dash).not.toMatch(/title=\{t\("dashboard\.dna"\)\}\s*reason=/);
  });
});

describe("reads are the player's own, through RLS, and read-only", () => {
  it("X-ray and DNA history use the caller's session, own player ids and no writes", () => {
    const src = read("src/lib/xray.functions.ts");
    expect((src.match(/\.middleware\(\[requireSupabaseAuth\]\)/g) ?? []).length).toBe(2);
    expect(src).not.toMatch(/supabaseAdmin|service_role|client\.server/);
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src).toContain('.in("internal_player_id", playerIds)');
    expect(src).toContain('ownPlayerIds(context.supabase, context.userId, "DNA_HISTORY")');
  });

  it("the X-ray route renders the real page, not a sample", () => {
    const route = read("src/routes/_authenticated/analysis.tsx");
    expect(route).toContain("return <RealXRayPage />;");
  });
});

describe("i18n", () => {
  it("every Fase 2 key exists in the 5 locales with the same placeholders", () => {
    for (const locale of LOCALES) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const [key, pt] of Object.entries(xrayPtBR)) {
        expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
        const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
        expect(vars(dict[key]!), `${locale}:${key}`).toEqual(vars(pt));
      }
    }
  });
});

/**
 * VGL 4.0 — Training Command Center and Coach 2.0. Areas are exactly the catalog's areas with
 * available exercises; session counts skip superseded sessions; the overview shows the plan's own
 * adherence integers; the Coach context lists only the cited map's own matches (no pick); the
 * empty briefing shows counts only.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { EXERCISES } from "@/lib/training/exercises";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, className }: { children: ReactNode; className?: string }) => (
      <a className={className}>{children}</a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { catalogAreas, sessionCounts, TrainingOverview, TrainingAreas } =
  await import("@/components/cs2/TrainingKit");
const { CoachMapContext, CoachEmptyBriefing } = await import("@/components/cs2/BriefingKit");
const { ADAPTIVE_TRAINING_KEY } = await import("@/components/training/AdaptiveTraining");
const { TRAINING_PRIORITIES_KEY } = await import("@/components/training/TrainingPrioritiesV2");
const { PLAYER_OVERVIEW_QUERY_KEY } = await import("@/components/real/RealData");

const render = (node: ReactNode, seed?: (qc: QueryClient) => void) => {
  const qc = new QueryClient();
  seed?.(qc);
  return renderToString(
    <QueryClientProvider client={qc}>
      <I18nProvider initialLocale="pt-BR">{node}</I18nProvider>
    </QueryClientProvider>,
  );
};

const session = (status: string, area = "aim") => ({ status, area }) as never;
const plan = {
  status: "ACTIVE",
  horizon: 30,
  startDate: "2026-11-18",
  endDate: "2026-12-17",
  adherence: { done: 1, due: 4, rate: 0.25 },
  nextReview: "2026-12-01",
  sessions: [
    session("DONE"),
    session("PLANNED", "utility"),
    session("SKIPPED"),
    session("SUPERSEDED", "clutch"),
  ],
};

describe("training kit", () => {
  it("catalog areas = areas of available exercises, with their counts", () => {
    const areas = catalogAreas();
    const expected = new Map<string, number>();
    for (const e of EXERCISES)
      if (e.available) for (const a of e.areas) expected.set(a, (expected.get(a) ?? 0) + 1);
    expect(
      new Map(areas.map((a: { area: string; exercises: number }) => [a.area, a.exercises])),
    ).toEqual(expected);
  });
  it("session counts skip superseded", () => {
    expect(sessionCounts(plan as never)).toEqual({ PLANNED: 1, DONE: 1, SKIPPED: 1 });
  });
  it("overview: priorities in order, plan adherence integers, sessions", () => {
    const html = render(<TrainingOverview />, (qc) => {
      qc.setQueryData(TRAINING_PRIORITIES_KEY, {
        priorities: [
          { key: "utility.flash_assists_per_round", dimension: "utility" },
          { key: "survivability.damage_taken_per_round", dimension: "survivability" },
        ],
        observing: [],
      });
      qc.setQueryData(ADAPTIVE_TRAINING_KEY, { plan, history: [], evidence: {} });
    });
    expect(html.match(/data-overview-priority=/g)).toHaveLength(2);
    expect(html).toContain('data-segmented-count="1/4"');
    expect(html).toContain("1 de 4");
    expect(html).toContain('data-session-count="DONE"');
  });
  it("areas: priority and plan tags from real data", () => {
    const html = render(<TrainingAreas />, (qc) => {
      qc.setQueryData(TRAINING_PRIORITIES_KEY, {
        priorities: [{ key: "x.y", dimension: "utility" }],
        observing: [],
      });
      qc.setQueryData(ADAPTIVE_TRAINING_KEY, { plan, history: [], evidence: {} });
    });
    expect(html).toContain('data-training-area="utility" data-area-priority="true"');
    expect(html).toContain('data-training-area="aim" data-area-priority="false"');
  });
});

describe("Coach 2.0", () => {
  const seed = (qc: QueryClient) =>
    qc.setQueryData(PLAYER_OVERVIEW_QUERY_KEY, {
      state: "READY",
      matches: [
        { matchId: "a", map: "de_mirage", playedAt: "2026-11-26T00:00:00Z", kills: 18, deaths: 13 },
        {
          matchId: "b",
          map: "de_mirage",
          playedAt: "2026-11-17T00:00:00Z",
          kills: null,
          deaths: 5,
        },
        { matchId: "c", map: "de_nuke", playedAt: "2026-11-25T00:00:00Z", kills: 28, deaths: 11 },
      ],
    });
  it("context lists the cited map's own matches only, newest first", () => {
    const html = render(<CoachMapContext content="Na Mirage o ADR foi 97." />, seed);
    expect(html.match(/data-coach-map-match=/g)).toHaveLength(2);
    expect(html.indexOf('data-coach-map-match="a"')).toBeLessThan(
      html.indexOf('data-coach-map-match="b"'),
    );
    expect(html).not.toContain('data-coach-map-match="c"');
    expect(html).toContain("18 / 13");
    expect(html).toContain("—");
  });
  it("empty briefing: counts and last match; no snapshot → says so", () => {
    const html = render(<CoachEmptyBriefing />, (qc) => {
      seed(qc);
      qc.setQueryData(["player", "dna", "history"], []);
    });
    expect(html).toContain("data-coach-briefing");
    expect(html).toMatch(/>3</);
    expect(html).toContain("Mirage");
    expect(html).toContain("Ainda sem snapshot");
  });
});

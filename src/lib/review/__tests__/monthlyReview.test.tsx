/**
 * PM5 — monthly review structure: month boundaries, sample states, comparison only with ≥ 3
 * matches on both months and the same method, explicit training marks only, and that nothing
 * can be delivered without an explicit, scoped, unrevoked consent. Static render in 5 locales.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import type { OverviewMatch } from "@/lib/playerOverview";
import { buildMonthlyReview, canDeliver, previousMonth } from "@/lib/review/monthlyReview";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { MonthlyReviewBody } = await import("@/components/review/MonthlyReviewCard");
const { monthlyReviewInput } = await import("@/lib/monthlyReview.functions");

const m = (id: string, playedAt: string, over: Partial<OverviewMatch> = {}): OverviewMatch =>
  ({
    matchId: id,
    map: "de_nuke",
    playedAt,
    dateSource: "played",
    kills: 20,
    deaths: 10,
    assists: 3,
    adr: 80,
    kast: 70,
    hsPercent: 40,
    rating: 1.1,
    firstKills: 2,
    firstDeaths: 1,
    tradeKills: 2,
    flashAssists: 1,
    clutchAttempts: 1,
    clutchWins: 0,
    roundsPlayed: 20,
    ...over,
  }) as OverviewMatch;

const nov = [1, 2, 3].map((d) => m(`n${d}`, `2026-11-0${d}T10:00:00Z`));
const oct = [1, 2, 3].map((d) => m(`o${d}`, `2026-10-0${d}T10:00:00Z`, { kills: 10 }));

describe("buildMonthlyReview", () => {
  it("handles month boundaries and the previous month", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
    const r = buildMonthlyReview({
      month: "2026-11",
      matches: [...nov, ...oct, m("d1", "2026-12-01T00:00:00Z")],
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    expect(r.matches).toBe(3);
    expect(r.state).toBe("READY");
  });

  it("compares only with enough matches on both months", () => {
    const r = buildMonthlyReview({
      month: "2026-11",
      matches: [...nov, ...oct],
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    const kd = r.metrics.find((x) => x.key === "kd")!;
    expect(kd.value).toBe(2);
    expect(kd.comparison).toEqual({ status: "OK", previous: 1, delta: 1, previousMatches: 3 });
    const thin = buildMonthlyReview({
      month: "2026-11",
      matches: [...nov, oct[0]!],
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    expect(thin.metrics.find((x) => x.key === "kd")!.comparison.status).toBe("INSUFFICIENT_SAMPLE");
    const none = buildMonthlyReview({
      month: "2026-11",
      matches: nov,
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    expect(none.metrics[0]!.comparison.status).toBe("NO_PREVIOUS_MONTH");
  });

  it("reports small samples and empty months without inventing values", () => {
    expect(
      buildMonthlyReview({
        month: "2026-11",
        matches: [nov[0]!],
        sessions: null,
        momentsCreatedAt: [],
        today: "2026-11-18",
      }).state,
    ).toBe("INSUFFICIENT_SAMPLE");
    const empty = buildMonthlyReview({
      month: "2026-09",
      matches: nov,
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    expect(empty).toMatchObject({ state: "NO_MATCHES", matches: 0, metrics: [] });
    const noAdr = buildMonthlyReview({
      month: "2026-11",
      matches: nov.map((x) => ({ ...x, adr: null })),
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    expect(noAdr.metrics.find((x) => x.key === "adr")!.value).toBeNull();
  });

  it("counts only explicit training marks and moments of the month", () => {
    const r = buildMonthlyReview({
      month: "2026-11",
      matches: nov,
      sessions: [
        { status: "DONE", scheduledOn: "2026-11-02" },
        { status: "SKIPPED", scheduledOn: "2026-11-03" },
        { status: "PLANNED", scheduledOn: "2026-11-05" },
        { status: "PLANNED", scheduledOn: "2026-11-25" },
        { status: "SUPERSEDED", scheduledOn: "2026-11-04" },
        { status: "DONE", scheduledOn: "2026-10-30" },
      ],
      momentsCreatedAt: ["2026-11-02T00:00:00Z", "2026-10-31T23:59:59Z"],
      today: "2026-11-18",
    });
    expect(r.training).toEqual({ done: 1, skipped: 1, due: 3 });
    expect(r.momentsSaved).toBe(1);
  });

  it("is never deliverable without explicit, scoped, unrevoked consent", () => {
    const r = buildMonthlyReview({
      month: "2026-11",
      matches: nov,
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    expect(r.delivery).toEqual({ status: "NOT_SENT", reason: "NO_CONSENT" });
    expect(canDeliver(null)).toBe(false);
    expect(canDeliver({ granted: false, scopes: ["monthly_review"], revokedAt: null })).toBe(false);
    expect(canDeliver({ granted: true, scopes: ["other"], revokedAt: null })).toBe(false);
    expect(canDeliver({ granted: true, scopes: ["monthly_review"], revokedAt: "2026-11-01" })).toBe(
      false,
    );
    expect(canDeliver({ granted: true, scopes: ["monthly_review"], revokedAt: null })).toBe(true);
  });

  it("validates the month input strictly", () => {
    expect(monthlyReviewInput.safeParse({ month: "2026-11" }).success).toBe(true);
    for (const bad of ["2026-13", "2026-1", "2026-11-01", "x"])
      expect(monthlyReviewInput.safeParse({ month: bad }).success).toBe(false);
    expect(monthlyReviewInput.safeParse({ month: "2026-11", userId: "x" }).success).toBe(false);
  });
});

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );

describe("MonthlyReviewBody", () => {
  it("renders every state with the not-sent notice and no raw key", () => {
    const ready = buildMonthlyReview({
      month: "2026-11",
      matches: [...nov, ...oct],
      sessions: [],
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    const empty = buildMonthlyReview({
      month: "2026-09",
      matches: nov,
      sessions: null,
      momentsCreatedAt: [],
      today: "2026-11-18",
    });
    for (const locale of LOCALES)
      for (const r of [ready, empty]) {
        const html = render(<MonthlyReviewBody r={r} />, locale);
        expect(html).toContain('data-review-delivery="NOT_SENT"');
        expect(html).not.toMatch(/(review|evolution\.metric)\.[A-Za-z]/);
      }
  });
});

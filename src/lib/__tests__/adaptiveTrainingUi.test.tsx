/**
 * PM5 / 4.2.9 — adaptive training UI (static render, every locale): no-evidence and
 * insufficient-sample states without a plan, priorities with their evidence and formula, an
 * active plan with sessions, exercise steps, goals without numeric targets, version history and
 * the no-promise notice. No raw translation key may leak.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { buildPlan, computePriorities, type PriorityResult } from "@/lib/training/adaptive";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to?: string }) => (
      <a data-to={to}>{children}</a>
    ),
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { AdaptiveTrainingBody } = await import("@/components/training/AdaptiveTraining");
type TrainingView = import("@/lib/adaptiveTraining.functions").TrainingView;
type PlanView = import("@/lib/adaptiveTraining.functions").PlanView;

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
const leaks = (html: string) =>
  html.match(
    /(training\.(adaptive|area|track)|exercise\.[a-z_]+\.|evolution\.metric)\.[A-Za-z_.]*/g,
  );

const evidence: PriorityResult = computePriorities(
  {
    state: "READY",
    matches: 8,
    dimensions: [
      { dimension: "aim", value: 0.3 },
      { dimension: "utility", value: 0.45 },
      { dimension: "clutch", value: null },
    ],
  },
  null,
  [],
);
const empty = (e: PriorityResult): TrainingView => ({ evidence: e, plan: null, history: [] });

function planView(): PlanView {
  const content = buildPlan(evidence, 30, { sessionsPerWeek: 3, minutesPerSession: 30 })!;
  return {
    id: "77777777-7777-4777-8777-777777777777",
    horizon: 30,
    status: "ACTIVE",
    startDate: "2026-11-18",
    endDate: "2026-12-17",
    pauseReason: null,
    activeVersion: 1,
    content,
    sessions: content.sessions.map((s, k) => ({
      id: `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`,
      version: 1,
      index: s.index,
      scheduledOn: "2026-11-18",
      area: s.area,
      exerciseId: s.exerciseId,
      minutes: s.minutes,
      status: k === 0 ? "DONE" : "PLANNED",
      durationMinutes: k === 0 ? 25 : null,
      note: null,
      completedAt: k === 0 ? "2026-11-18T20:00:00Z" : null,
    })),
    adherence: { done: 1, due: 1, rate: 1 },
    nextReview: "2026-11-25",
    versions: [{ version: 1, reason: "CREATED", createdAt: "2026-11-18T01:00:00Z", diff: null }],
  };
}

describe("AdaptiveTrainingBody", () => {
  it("shows the no-evidence and insufficient-sample states without creating a plan", () => {
    for (const locale of LOCALES) {
      const none = render(
        <AdaptiveTrainingBody
          v={empty({
            version: "cs2.training-priority.v1",
            state: "NO_EVIDENCE",
            matches: 0,
            priorities: [],
            excluded: [],
          })}
        />,
        locale,
      );
      expect(none).not.toContain("data-create-plan");
      expect(leaks(none)).toBeNull();
      const low = render(
        <AdaptiveTrainingBody
          v={empty({
            version: "cs2.training-priority.v1",
            state: "INSUFFICIENT_SAMPLE",
            matches: 2,
            priorities: [],
            excluded: [],
          })}
        />,
        locale,
      );
      expect(low).not.toContain("data-create-plan");
      expect(leaks(low)).toBeNull();
    }
  });

  it("lists priorities with evidence, the formula and excluded areas before creation", () => {
    for (const locale of LOCALES) {
      const html = render(<AdaptiveTrainingBody v={empty(evidence)} />, locale);
      expect(html).toContain("data-create-plan");
      expect(html).toContain('data-to="/player-dna"');
      expect(leaks(html)).toBeNull();
    }
    const pt = render(<AdaptiveTrainingBody v={empty(evidence)} />);
    expect(pt).toContain("Player DNA: índice 30");
    expect(pt).toContain("não medida");
    expect(pt).toContain("não garante melhora");
  });

  it("renders an active plan with sessions, exercise steps, goals and versions", () => {
    for (const locale of LOCALES) {
      const html = render(
        <AdaptiveTrainingBody v={{ ...empty(evidence), plan: planView() }} />,
        locale,
      );
      expect(html).not.toContain("data-create-plan");
      expect(leaks(html)).toBeNull();
    }
    const pt = render(<AdaptiveTrainingBody v={{ ...empty(evidence), plan: planView() }} />);
    expect(pt).toMatch(/Plano de (<!-- -->)?30(<!-- -->)? dias/);
    expect(pt).toContain("Aim Botz");
    expect(pt).toContain("Concluir pelo menos");
    expect(pt).toContain("Salvar e revisar");
    expect(pt).toContain("criação");
  });
});

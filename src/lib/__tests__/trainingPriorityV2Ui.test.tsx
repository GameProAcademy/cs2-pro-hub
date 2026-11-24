/** UX-1.7 — the ONE training list on screen (W9/W10), 5 locales. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import type { PriorityResultV2, PrioritySignal } from "@/lib/training/priorityV2";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { TrainingPrioritiesBody } = await import("@/components/training/TrainingPrioritiesV2");

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (r: PriorityResultV2, locale: Locale = "pt-BR") =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale={locale}>
        <TrainingPrioritiesBody r={r} />
      </I18nProvider>
    </QueryClientProvider>,
  );
const sig = (o: Partial<PrioritySignal>): PrioritySignal => ({
  key: "decision_making.kast",
  dimension: "decision_making",
  category: "ROUND_RATE",
  value: 0.4,
  interval: [0.33, 0.47],
  reference: 0.6,
  sample: 200,
  sampleUnit: "rounds",
  matches: 8,
  status: "RECOMMEND",
  missing: null,
  distance: 0.13,
  ...o,
});

describe("training v2 list", () => {
  it.each(LOCALES)("shows value, interval, reference and sample (%s)", (l) => {
    const html = render(
      { version: "cs2.training-priority.v2", matches: 8, priorities: [sig({})], observing: [] },
      l,
    );
    expect(html).toContain('data-priority-v2="decision_making.kast"');
    expect(html).toMatch(/40[,.]0/);
    expect(html).toMatch(/33[,.]0/);
    expect(html).toMatch(/60[,.]0/);
    expect(html).toContain((dictionaries[l] as Record<string, string>)["training.v2.method"]);
  });

  it("with no recommendation says so, never a judgement", () => {
    const html = render({
      version: "cs2.training-priority.v2",
      matches: 3,
      priorities: [],
      observing: [
        sig({
          status: "OBSERVE",
          reason: "BELOW_RECOMMEND_MINIMUM",
          missing: { sample: 36, matches: 1 },
        }),
      ],
    });
    expect(html).toContain("data-training-v2-none");
    expect(html).not.toMatch(/fraco|ruim|weak|bad/i);
  });
});

describe("UX-1.7 production fix: stored plan priorities are history, not a second list", () => {
  it("the active plan renders its stored priorities inside a closed, method-labelled details", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/training/AdaptiveTraining.tsx", "utf8");
    expect(src).toContain("data-plan-origin");
    expect(src).not.toMatch(/title=\{t\("training\.adaptive\.priorities"\)\}/);
    expect(src).toContain(
      'fill(t("training.plan.origin"), { version: plan.content.priorityVersion })',
    );
  });
});

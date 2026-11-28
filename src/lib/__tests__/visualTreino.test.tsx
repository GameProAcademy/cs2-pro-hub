/**
 * Visual phase — Treino: ranked priorities get a rank tile and a reference gauge placed from the
 * same numbers as the text (no new value), observed signals are told apart by the shared data
 * state words (insufficient sample vs derived), and plan states are semantic ToneBadges.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import type { PriorityResultV2, PrioritySignal } from "@/lib/training/priorityV2";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { SignalLine, TrainingPrioritiesBody } =
  await import("@/components/training/TrainingPrioritiesV2");

const render = (r: PriorityResultV2) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="pt-BR">
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

describe("visual phase — Treino", () => {
  it("a ranked priority shows the rank tile and a gauge at the stated value, interval and reference", () => {
    const html = render({
      version: "cs2.training-priority.v2",
      matches: 8,
      priorities: [sig({})],
      observing: [],
    });
    expect(html).toContain('data-priority-rank="1"');
    expect(html).toContain("data-priority-bar");
    // Positions come from the same numbers the text shows: 33%, 47%, 40% and 60%.
    // VGL 5.0: band from 33% (interval), bar filled to 40% (value), reference line at 60%.
    expect(html).toContain("left:33%");
    expect(html).toContain("width:40%");
    expect(html).toContain("left:60%");
    // Labelled: the player's value, the reference and the gap in points (what it means).
    expect(html).toContain('data-priority-gap="below"');
    expect(html).toContain("20,0 pontos abaixo da referência");
    expect(html).toContain("data-priority-legend");
    expect(html).toContain('data-card-icon="target"');
  });

  it("observed signals are told apart: insufficient sample has no value or gauge, a shown value is derived", () => {
    const line = (o: Partial<PrioritySignal>) =>
      renderToString(
        <QueryClientProvider client={new QueryClient()}>
          <I18nProvider initialLocale="pt-BR">
            <SignalLine s={sig(o)} />
          </I18nProvider>
        </QueryClientProvider>,
      );
    const insufficient = line({
      value: null,
      interval: null,
      status: "OBSERVE",
      reason: "BELOW_SHOW_MINIMUM",
    });
    expect(insufficient).toContain('data-state="INSUFFICIENT_SAMPLE"');
    expect(insufficient).toContain('data-tone="neutral"');
    expect(insufficient).not.toContain("data-priority-bar");
    expect(insufficient).not.toContain("data-signal-value");
    const derived = line({
      status: "OBSERVE",
      reason: "ABOVE_REFERENCE",
      value: 0.7,
      interval: [0.62, 0.78],
    });
    expect(derived).toContain('data-state="DERIVED"');
    expect(derived).toContain("data-priority-bar");
    expect(derived).toContain('data-priority-gap="above"');
    expect(derived).not.toContain("data-priority-rank");
  });
});

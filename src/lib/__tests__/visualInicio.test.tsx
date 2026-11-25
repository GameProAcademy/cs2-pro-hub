/**
 * Visual phase — Início: the shared cards accept a decorative game icon, the KPI icon turns
 * neutral when the value is absent (never lime for a missing value), and admission and job
 * states are the shared ToneBadge with a semantic tone instead of hand-made spans.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChartCard } from "@/components/common/ChartCard";
import { MetricCard } from "@/components/common/MetricCard";
import { I18nProvider } from "@/i18n";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
const { AdmissionBadge, RecentUploads } = await import("@/components/real/RealData");

const render = (node: React.ReactNode) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="pt-BR">{node}</I18nProvider>
    </QueryClientProvider>,
  );

describe("visual phase — Início", () => {
  it("ChartCard renders the optional icon tile and nothing when it is absent", () => {
    expect(
      render(
        <ChartCard title="A" icon="rounds" showDemoTag={false}>
          x
        </ChartCard>,
      ),
    ).toContain('data-card-icon="rounds"');
    expect(
      render(
        <ChartCard title="A" showDemoTag={false}>
          x
        </ChartCard>,
      ),
    ).not.toContain("data-card-icon");
  });

  it("MetricCard keeps the icon lime for a value and neutral for a missing value", () => {
    const present = render(
      <MetricCard showDemoTag={false} icon="crosshair" label="K/D" value="1,07" />,
    );
    expect(present).toContain('data-game-icon="crosshair"');
    expect(present).toContain('class="size-3.5 shrink-0 text-primary"');
    const missing = render(
      <MetricCard showDemoTag={false} icon="trend" label="Win" value={null} />,
    );
    expect(missing).toContain('data-metric-missing="true"');
    expect(missing).toContain('class="size-3.5 shrink-0 text-neutral"');
    expect(missing).not.toContain("size-3.5 shrink-0 text-primary");
  });

  it("the admission badge is a ToneBadge: limited is attention with an icon, certified is context", () => {
    const limited = render(
      <AdmissionBadge
        row={{ admission: "LIMITED", limitations: ["L04-MATCH-RESULT-UNRESOLVED"] } as never}
      />,
    );
    expect(limited).toContain('data-tone="attention"');
    expect(limited).toContain('data-game-icon="alert"');
    expect(limited).toContain("aria-label=");
    const certified = render(
      <AdmissionBadge row={{ admission: "CERTIFIED", limitations: [] } as never} />,
    );
    expect(certified).toContain('data-tone="context"');
  });

  it("job states keep their meaning as tones: failed critical, blocked attention, processed brand", () => {
    const html = render(
      <RecentUploads
        jobs={
          [
            {
              jobId: "a",
              uploadId: "u1",
              fileName: "a.dem",
              queuedAt: "2026-11-25T10:00:00Z",
              status: "failed",
              identity: "NOT_APPLICABLE",
            },
            {
              jobId: "b",
              uploadId: "u2",
              fileName: "b.dem",
              queuedAt: "2026-11-25T10:00:00Z",
              status: "blocked_raw_audit",
              identity: "CONFLICT",
            },
            {
              jobId: "c",
              uploadId: "u3",
              fileName: "c.dem",
              queuedAt: "2026-11-25T10:00:00Z",
              status: "processed",
              identity: "CONFIRMED",
            },
          ] as never
        }
      />,
    );
    expect(html).toMatch(/data-tone="critical"[^>]*data-job-status="failed"/);
    expect(html).toMatch(/data-tone="attention"[^>]*data-job-status="blocked_raw_audit"/);
    expect(html).toMatch(/data-tone="brand"[^>]*data-job-status="processed"/);
    expect(html).toMatch(/data-tone="attention"[^>]*data-job-identity="CONFLICT"/);
  });
});

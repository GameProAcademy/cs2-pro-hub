/**
 * PR5 — persistent pending actions (player identification) and structured flow events.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { guidancePtBR } from "@/i18n/locales/guidance/pt-BR";
import { pendingIdentityJobs, type GuidanceJob } from "@/lib/pipeline/errorGuidance";
import { demoFlowEventRecord } from "@/lib/pipeline/flowEvents";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, search }: { children: React.ReactNode; search?: { identify?: string } }) => (
      <a href={`/upload?identify=${search?.identify ?? ""}`}>{children}</a>
    ),
  };
});

const { PendingActionsBanner, PendingActionsBadge } =
  await import("@/components/pipeline/PendingActionsBanner");

type Job = GuidanceJob & { jobId: string; fileName: string; map: string | null };

function job(over: Partial<Job> = {}): Job {
  return {
    jobId: "10000000-0000-0000-0000-000000000001",
    fileName: "match.dem",
    map: "de_ancient",
    status: "processed",
    stage: "done",
    errorCode: null,
    retryCount: 0,
    maxRetries: 3,
    matchId: "m1",
    demoAvailable: true,
    parserCurrent: true,
    supersededByJobId: null,
    partialParse: false,
    attachmentState: "unattached",
    attachmentConfirmationStatus: undefined,
    ...over,
  };
}

describe("pendingIdentityJobs", () => {
  it("lists processed jobs whose player is not confirmed yet", () => {
    const jobs = [
      job({ jobId: "a" }),
      job({
        jobId: "b",
        attachmentState: "attached",
        attachmentConfirmationStatus: "pending_confirmation",
      }),
      job({
        jobId: "c",
        attachmentState: "attached",
        attachmentConfirmationStatus: "user_confirmed",
      }),
      job({
        jobId: "d",
        attachmentState: "attached",
        attachmentConfirmationStatus: "manual_selected",
      }),
      job({ jobId: "e", supersededByJobId: "x" }),
      job({ jobId: "f", parserCurrent: false }),
      job({ jobId: "g", status: "processing", matchId: null }),
      job({ jobId: "h", status: "failed", errorCode: "PARSER_TIMEOUT" }),
    ];
    expect(pendingIdentityJobs(jobs).map((j) => j.jobId)).toEqual(["a", "b", "h"]);
  });

  it("a pending selection stays listed until the backend records the choice", () => {
    const pending = job();
    expect(pendingIdentityJobs([pending])).toHaveLength(1);
    expect(
      pendingIdentityJobs([
        {
          ...pending,
          attachmentState: "attached",
          attachmentConfirmationStatus: "manual_selected",
        },
      ]),
    ).toHaveLength(0);
  });
});

function render(node: React.ReactNode, jobs: Job[], locale: Locale = "pt-BR") {
  const client = new QueryClient();
  client.setQueryData(["pipeline", "jobs"], jobs);
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}

describe("banner and badge", () => {
  it("render nothing without pending actions", () => {
    const done = job({
      attachmentState: "attached",
      attachmentConfirmationStatus: "user_confirmed",
    });
    expect(render(<PendingActionsBanner />, [done])).toBe("");
    expect(render(<PendingActionsBadge />, [done])).toBe("");
  });

  it("list every pending demo with a link to its selection step, in amber", () => {
    const html = render(<PendingActionsBanner />, [
      job({ jobId: "11111111-1111-1111-1111-111111111111", fileName: "a.dem" }),
      job({ jobId: "22222222-2222-2222-2222-222222222222", fileName: "b.dem" }),
    ]);
    expect(html).toContain("2 demos aguardando sua identificação");
    expect(html).toContain("/upload?identify=11111111-1111-1111-1111-111111111111");
    expect(html).toContain("/upload?identify=22222222-2222-2222-2222-222222222222");
    expect(html).toContain("border-warning");
    expect(html).not.toContain("destructive");
    const badge = render(<PendingActionsBadge />, [job()]);
    expect(badge).toContain('data-pending-count="1"');
  });

  it("copy exists in the 5 locales", () => {
    for (const locale of ["pt-BR", "en", "es", "fr", "pt-PT"] as Locale[]) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const key of Object.keys(guidancePtBR).filter((k) => k.startsWith("pending."))) {
        expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(resolve(p), "utf8");
  it("menu, header, Dashboard, card and upload route expose the pending action", () => {
    const shell = read("src/components/layout/AppShell.tsx");
    expect(shell.match(/<PendingActionsBadge/g)?.length).toBe(2);
    expect(read("src/routes/_authenticated/dashboard.tsx")).toContain("<PendingActionsBanner />");
    const upload = read("src/routes/_authenticated/upload.tsx");
    expect(upload).toContain("UUID.test(identify)");
    expect(upload).toContain("<DemoIngestPanel identifyJobId={identify} />");
    const panel = read("src/components/pipeline/DemoIngestPanel.tsx");
    // Opens the modal only for a job the backend still reports as pending.
    expect(panel).toContain(
      "pendingIdentityJobs(jobs.data ?? []).find((job) => job.jobId === identifyJobId)",
    );
    expect(panel).toContain('t("guidance.identity_pending.title")');
  });
});

describe("structured flow events", () => {
  it("keeps only allow-listed, safe fields", () => {
    const record = demoFlowEventRecord("error_classified", {
      jobId: "10000000-0000-0000-0000-000000000001",
      category: "raw_audit_review",
      errorCode: "RAW_AUDIT_BLOCKED",
      // @ts-expect-error — not an allowed field
      email: "someone@example.com",
      stage: "has spaces and <html>",
    });
    expect(record).toEqual({
      event: "error_classified",
      jobId: "10000000-0000-0000-0000-000000000001",
      category: "raw_audit_review",
      errorCode: "RAW_AUDIT_BLOCKED",
    });
  });

  it("the modal, the panel and the report emit the flow events", () => {
    const modal = readFileSync(resolve("src/components/pipeline/DemoFlowModal.tsx"), "utf8");
    for (const event of [
      "modal_opened",
      "players_available",
      "player_selected",
      "error_classified",
      "analysis_done",
    ]) {
      expect(modal, event).toContain(`"${event}"`);
    }
    const panel = readFileSync(resolve("src/components/pipeline/DemoIngestPanel.tsx"), "utf8");
    expect(panel).toContain('"upload_started"');
    expect(panel).toContain('"job_followed"');
    const report = readFileSync(resolve("src/components/pipeline/ReportProblem.tsx"), "utf8");
    for (const event of ["report_created", "report_email_sent", "report_email_failed"]) {
      expect(report, event).toContain(`"${event}"`);
    }
  });
});

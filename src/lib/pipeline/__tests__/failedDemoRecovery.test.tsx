import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoPlayerIdentity, identityErrorKey } from "@/components/pipeline/DemoPlayerIdentity";
import { I18nProvider } from "@/i18n";
import { ptBR } from "@/i18n/locales/pt-BR";
import type { DemoIdentityView } from "@/lib/pipeline-identity.functions";
import { identityActionFor, type IdentityActionInput } from "@/lib/pipeline/identityRecovery";

/**
 * Production defect (2026-10-21): the Mirage job 921b55cf ended `failed`
 * (CANONICAL_PERSISTENCE_ERROR, retry_count 3 > max_retries 2) with its Canonical match,
 * 10 detected players and the demo file all still present, but the card showed no way to
 * select the player and start a new attempt: DemoIngestPanel rendered the identity panel
 * only for `processed`, and the plain retry was hidden by the exhausted budget.
 */
const MIRAGE_FAILED: IdentityActionInput = {
  status: "failed",
  errorCode: "CANONICAL_PERSISTENCE_ERROR",
  matchId: "95186f3f-ec72-486d-9be0-f8e161737fae",
  retryCount: 3,
  demoAvailable: true,
  supersededByJobId: null,
};

describe("identity action per job state (A, E, F)", () => {
  it("A: the failed Mirage job offers 'select player and try again'", () => {
    expect(identityActionFor(MIRAGE_FAILED)).toBe("select_and_retry");
  });

  it("F: processed offers the identity panel; in-flight and terminal-by-user states offer nothing", () => {
    expect(identityActionFor({ ...MIRAGE_FAILED, status: "processed", errorCode: null })).toBe(
      "identity",
    );
    for (const status of [
      "pending",
      "processing",
      "cancel_requested",
      "cancelled",
      "blocked_raw_audit",
    ])
      expect(identityActionFor({ ...MIRAGE_FAILED, status })).toBeNull();
  });

  it("E: no detected players (no Canonical match) -> no action that would fail", () => {
    expect(identityActionFor({ ...MIRAGE_FAILED, matchId: null })).toBeNull();
  });

  it("E: demo file expired -> explicit re-upload guidance, never a retry", () => {
    expect(identityActionFor({ ...MIRAGE_FAILED, demoAvailable: false })).toBe("reupload_required");
  });

  it("E: a permanent refusal (quarantined content) offers nothing", () => {
    expect(
      identityActionFor({ ...MIRAGE_FAILED, errorCode: "CANONICAL_MATCH_QUARANTINED" }),
    ).toBeNull();
  });

  it("E: superseded jobs and the dispatch bound offer nothing", () => {
    expect(identityActionFor({ ...MIRAGE_FAILED, supersededByJobId: "other" })).toBeNull();
    expect(identityActionFor({ ...MIRAGE_FAILED, retryCount: 10 })).toBeNull();
    expect(identityActionFor({ ...MIRAGE_FAILED, retryCount: 9 })).toBe("select_and_retry");
  });
});

function identityView(overrides: Partial<DemoIdentityView> = {}): DemoIdentityView {
  return {
    jobId: "921b55cf-0000-0000-0000-000000000000",
    matchId: MIRAGE_FAILED.matchId,
    attachmentState: "attached",
    attachmentReason: null,
    attachmentMethod: "self_declared_player",
    attachmentConfidence: "medium",
    attachmentSource: "user",
    attachmentParticipantKey: "p1",
    declaredNickname: null,
    declaredParticipantKey: "p1",
    observedNickname: "Player One",
    latestDecisionStatus: "manually_resolved",
    confirmationStatus: "manual_selected",
    latestDecisionEventKey: "manual:p1",
    participants: Array.from({ length: 10 }, (_, i) => ({
      participantKey: `p${i + 1}`,
      nickname: `Player ${i + 1}`,
      team: null,
    })),
    suggestion: null,
    ...overrides,
  };
}

function render(recover: boolean, data: DemoIdentityView | undefined): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  const jobId = "921b55cf-0000-0000-0000-000000000000";
  if (data) client.setQueryData(["pipeline", "identity", jobId], data);
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <DemoPlayerIdentity jobId={jobId} recover={recover} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("the failed job's card renders the action (A, F)", () => {
  it("recover mode shows an enabled 'Selecionar jogador e tentar novamente' even after an earlier selection", () => {
    const html = render(true, identityView());
    expect(html).toContain(ptBR["pipeline.identify.selectAndRetry"]);
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>[^<]*Selecionar jogador/);
  });

  it("the processed card keeps its own label", () => {
    const html = render(false, identityView());
    expect(html).not.toContain(ptBR["pipeline.identify.selectAndRetry"]);
    expect(html).toContain(ptBR["pipeline.identify.attached"]);
  });

  it("while the job's identity is loading, nothing clickable is rendered", () => {
    expect(render(true, undefined)).not.toContain(ptBR["pipeline.identify.selectAndRetry"]);
  });
});

describe("real errors reach the user (E)", () => {
  it("maps refusal tokens to specific messages and anything else to the generic one", () => {
    expect(identityErrorKey(new Error("JOB_NOT_RECOVERABLE"))).toBe(
      "pipeline.identify.notRecoverable",
    );
    expect(identityErrorKey(new Error("IDENTITY_RERUN_LIMIT_REACHED"))).toBe(
      "pipeline.identify.rerunLimit",
    );
    expect(identityErrorKey(new Error("boom"))).toBe("pipeline.identify.saveError");
    expect(identityErrorKey(null)).toBe("pipeline.identify.saveError");
  });
});

describe("wiring (A, B, F)", () => {
  const panel = readFileSync(resolve("src/components/pipeline/DemoIngestPanel.tsx"), "utf8");
  const identity = readFileSync(resolve("src/components/pipeline/DemoPlayerIdentity.tsx"), "utf8");
  const server = readFileSync(resolve("src/lib/pipeline-identity.functions.ts"), "utf8");

  it("the card is driven by identityActionFor, not by status === processed", () => {
    expect(panel).not.toMatch(/job\.status === "processed" \? \(\s*<>\s*\{job\.attachmentState/);
    expect(panel).toContain('identityActionFor(job) === "select_and_retry"');
    expect(panel).toContain("<DemoPlayerIdentity jobId={job.jobId} recover />");
    expect(panel).toContain('identityActionFor(job) === "reupload_required"');
  });

  it("only one recovery button per card: the plain retry yields to select-and-retry", () => {
    expect(panel).toContain('identityActionFor(job) !== "select_and_retry" &&');
  });

  it("B: repeated clicks are blocked while pending and after the attempt started", () => {
    expect(identity).toContain("declare.isPending || started");
    expect(identity).toContain("started || isParticipantConfirmationDisabled");
  });

  it("the server applies the same rule before re-queuing a failed job", () => {
    const start = server.indexOf("export const declareDemoPlayer");
    const body = server.slice(start, server.indexOf("supabaseAdmin.rpc", start));
    expect(body).toContain('job.status === "failed"');
    expect(body).toContain('!== "select_and_retry"');
    expect(body).toContain('throw new Error("JOB_NOT_RECOVERABLE")');
  });
});

/**
 * FASE 2.7.2 — GATE 02-B — REAL `.dem` E2E CONSOLE (master admin only).
 *
 * Internal QA surface, deliberately technical and untranslated: it shows raw
 * evidence (error codes, row counts, worker revision) that must be quoted
 * verbatim in the gate report. It never fabricates data — every number comes
 * from the server functions in `@/lib/pipeline-e2e.functions`.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { DemoUploadError, submitDemo } from "@/lib/pipeline/client";
import type { E2EEvidence, E2EExpectation, E2EVerdict } from "@/lib/pipeline/e2e";
import { getDemoE2EPreflight, runDemoE2E, type E2ERunReport } from "@/lib/pipeline-e2e.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/demo-e2e")({
  head: () => ({
    meta: [
      { title: "E2E de demo real — Administração CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Execução controlada do pipeline real de uma demo .dem com evidência de banco, veredito estrito e prova de idempotência.",
      },
      { property: "og:title", content: "E2E de demo real — Administração CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Prova end-to-end do pipeline real de demos do CS2 PRO AI COACH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDemoE2EPage,
});

const VERDICT_STYLE: Record<E2EVerdict, string> = {
  PASS: "border-success/40 bg-success/10 text-success",
  FAIL: "border-destructive/40 bg-destructive/10 text-destructive",
  BLOCKED: "border-warning/40 bg-warning/10 text-warning",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="break-all text-right font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function EvidenceBlock({ title, evidence }: { title: string; evidence: E2EEvidence }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 px-4 py-3">
      <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-primary">{title}</h4>
      <Row label="canonical match ids" value={evidence.matchIds.join(", ") || "—"} />
      <Row label="match_sources" value={String(evidence.matchSourceCount)} />
      <Row label="match_participants" value={String(evidence.participants)} />
      <Row label="match_rounds" value={String(evidence.rounds)} />
      <Row label="round_players" value={String(evidence.roundPlayers)} />
      <Row label="round_events" value={String(evidence.events)} />
      <Row label="match_metrics" value={String(evidence.metrics)} />
      <Row label="match_features" value={String(evidence.features)} />
    </div>
  );
}

function VerdictBadge({ verdict, reasons }: { verdict: E2EVerdict; reasons: string[] }) {
  const Icon = verdict === "PASS" ? CheckCircle2 : verdict === "FAIL" ? XCircle : ShieldAlert;
  return (
    <div className={cn("rounded-lg border px-4 py-3", VERDICT_STYLE[verdict])}>
      <p className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.16em]">
        <Icon className="size-4" aria-hidden />
        {verdict}
      </p>
      {reasons.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AdminDemoE2EPage() {
  const t = useT();
  const { adminSession } = Route.useRouteContext();
  const [expectation, setExpectation] = useState<E2EExpectation>("positive");
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reports, setReports] = useState<E2ERunReport[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const preflight = useQuery({
    queryKey: ["admin", "demo-e2e", "preflight"],
    queryFn: () => getDemoE2EPreflight(),
    refetchInterval: 30_000,
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      submitDemo(file, {
        onProgress: ({ percent }) => setUploadPercent(percent),
      }),
    onMutate: () => {
      setUploadError(null);
      setRunError(null);
      setReports([]);
      setJobId(null);
      setUploadPercent(0);
    },
    onSuccess: (result) => setJobId(result.jobId),
    // Admin console: keep the FULL diagnostic (HTTP status + response body),
    // never collapse a storage failure into a bare error code.
    onError: (error) =>
      setUploadError(
        error instanceof DemoUploadError
          ? error.message
          : error instanceof Error
            ? error.message
            : "UPLOAD_FAILED",
      ),
  });

  const run = useMutation({
    mutationFn: (input: { rerun: boolean }) =>
      runDemoE2E({ data: { jobId: jobId!, expectation, rerun: input.rerun } }),
    onMutate: () => setRunError(null),
    onSuccess: (report) => setReports((previous) => [...previous, report]),
    onError: (error) => setRunError(error instanceof Error ? error.message : "RUN_FAILED"),
  });

  const identityOk = preflight.data ? preflight.data.healthy && !preflight.data.error : false;

  return (
    <AdminShell session={adminSession}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="FASE 2.7.2 · GATE 02"
          title={t("admin.nav.demoE2E")}
          description="Executa o pipeline real de uma demo .dem e reporta a evidência bruta do banco. Sem mocks, sem parser falso, veredito estrito."
        />

        {preflight.isLoading ? (
          <LoadingState />
        ) : preflight.isError || !preflight.data ? (
          <ErrorState />
        ) : (
          <section className="rounded-xl border border-border bg-card/40 px-4 py-3">
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.14em]">
              Preflight (Gate 1E.1)
            </h3>
            <Row label="worker endpoint" value={preflight.data.endpoint || "—"} />
            <Row
              label="health"
              value={`${preflight.data.healthy ? "ok" : "down"} (${preflight.data.healthStatus ?? "—"})`}
            />
            <Row label="parser configured" value={String(preflight.data.parserAvailable)} />
            <Row
              label="worker identity"
              value={
                preflight.data.identity
                  ? `${preflight.data.identity.name ?? "?"}@${preflight.data.identity.version ?? "?"} contract=${preflight.data.identity.contractVersion ?? "?"} ${preflight.data.identity.revision ?? "no-revision"}`
                  : "—"
              }
            />
            <Row
              label="app expects"
              value={`${preflight.data.expected.name}@${preflight.data.expected.version} contract=${preflight.data.expected.contractVersion} ${preflight.data.expected.revision ?? "no-revision"}${preflight.data.expected.revisionRequired ? " (locked)" : ""}`}
            />
            <Row
              label="versions"
              value={`ingestion=${preflight.data.versions.ingestionSchema} canonical=${preflight.data.versions.canonicalSchema} metrics=${preflight.data.versions.metrics} features=${preflight.data.versions.features} analysis=${preflight.data.versions.analysis}`}
            />
            <Row label="preflight error" value={preflight.data.error ?? "none"} />
            {!identityOk ? (
              <p className="mt-2 rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-xs text-warning">
                Preflight reprovado: qualquer execução seria reportada como BLOCKED.
              </p>
            ) : null}
          </section>
        )}

        <section className="space-y-3 rounded-xl border border-border bg-card/40 px-4 py-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em]">
            1 · Demo real (.dem)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {(["positive", "negative"] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={expectation === option ? "default" : "outline"}
                onClick={() => setExpectation(option)}
              >
                {option === "positive"
                  ? "Cenário positivo (demo válida)"
                  : "Cenário negativo (demo inválida)"}
              </Button>
            ))}
          </div>
          <input
            type="file"
            accept=".dem"
            aria-label="Selecionar demo .dem real"
            className="block w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-wider file:text-foreground"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
          {upload.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              upload {uploadPercent}%
            </p>
          ) : null}
          {uploadError ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {uploadError}
            </p>
          ) : null}
          {jobId ? <Row label="job id" value={jobId} /> : null}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card/40 px-4 py-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em]">
            2 · Execução real do pipeline
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => run.mutate({ rerun: false })}
              disabled={!jobId || run.isPending || reports.length > 0}
            >
              <PlayCircle className="mr-1.5 size-4" aria-hidden />
              Executar (run 1)
            </Button>
            <Button
              variant="outline"
              onClick={() => run.mutate({ rerun: true })}
              disabled={!jobId || run.isPending || reports.length === 0}
            >
              <PlayCircle className="mr-1.5 size-4" aria-hidden />
              Reprocessar mesma demo (idempotência)
            </Button>
          </div>
          {run.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              processando a demo real (parse + canônico + projeção)…
            </p>
          ) : null}
          {runError ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {runError}
            </p>
          ) : null}
        </section>

        {reports.map((report) => (
          <section
            key={`${report.jobId}-${report.run}-${report.startedAt}`}
            className="space-y-3 rounded-xl border border-border bg-card/40 px-4 py-4"
          >
            <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em]">
              Run {report.run} · {report.expectation} · {report.fileName || report.uploadId}
            </h3>
            <VerdictBadge verdict={report.evaluation.verdict} reasons={report.evaluation.reasons} />
            {report.idempotency ? (
              <div>
                <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  idempotência
                </p>
                <VerdictBadge
                  verdict={report.idempotency.verdict}
                  reasons={report.idempotency.reasons}
                />
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-background/40 px-4 py-3">
              <Row label="job status" value={report.job.status} />
              <Row label="error code" value={report.job.errorCode ?? "none"} />
              <Row label="error detail" value={report.job.errorMessage ?? "—"} />
              <Row label="canonical match id" value={report.job.matchId ?? "—"} />
              <Row label="rounds valid" value={String(report.job.roundsValid ?? "—")} />
              <Row label="players detected" value={String(report.job.playersDetected ?? "—")} />
              <Row
                label="parser"
                value={`${report.job.parserName ?? "?"}@${report.job.parserVersion ?? "?"} ${report.job.parserRevision ?? "no-revision"}`}
              />
              <Row
                label="extraction confidence"
                value={
                  report.job.extractionConfidence != null
                    ? `${Math.round(report.job.extractionConfidence * 100)}%`
                    : "—"
                }
              />
              <Row label="partial parse" value={String(report.job.partialParse)} />
              <Row label="job duration" value={`${report.job.durationMs ?? "—"} ms`} />
              <Row label="run elapsed" value={`${report.elapsedMs} ms`} />
              <Row
                label="worker"
                value={`${report.worker.name ?? "?"}@${report.worker.version ?? "?"} ${report.worker.revision ?? "no-revision"} ready=${String(report.worker.ready)}`}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <EvidenceBlock title="evidence before" evidence={report.evidenceBefore} />
              <EvidenceBlock title="evidence after" evidence={report.evidenceAfter} />
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}

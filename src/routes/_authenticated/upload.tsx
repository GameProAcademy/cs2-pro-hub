import { createFileRoute } from "@tanstack/react-router";
import { Cpu, Database, FileImage, FileText, Layers, Lightbulb, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { UploadBox, type UploadKind } from "@/components/common/UploadBox";
import { AppShell } from "@/components/layout/AppShell";
import { DemoIngestPanel } from "@/components/pipeline/DemoIngestPanel";
import { GamersClubPanel } from "@/components/integrations/GamersClubPanel";
import { PlayerIdentityPanel } from "@/components/integrations/PlayerIdentityPanel";
import { SourcesPanel } from "@/components/pipeline/SourcesPanel";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/config/app";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Analisar meu jogo — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Envie sua demo .dem ou seus prints e relatórios de estatísticas de CS2 para análise de performance.",
      },
      { property: "og:title", content: "Analisar meu jogo — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Dois caminhos de entrada: demo .dem ou dados e relatórios de estatísticas.",
      },
    ],
  }),
  component: AnalyzePage,
});

/** Both paths converge into the same future normalization pipeline. */
const pipeline: { icon: typeof Cpu; labelKey: TranslationKey; done: boolean }[] = [
  { icon: ShieldCheck, labelKey: "analyze.pipeline.validation", done: true },
  { icon: Cpu, labelKey: "analyze.pipeline.parser", done: true },
  { icon: FileText, labelKey: "analyze.pipeline.extractor", done: false },
  { icon: Layers, labelKey: "analyze.pipeline.normalizer", done: true },
  { icon: Database, labelKey: "analyze.pipeline.metrics", done: true },
];

function PathCard({
  kind,
  active,
  onSelect,
  icon: Icon,
}: {
  kind: UploadKind;
  active: boolean;
  onSelect: () => void;
  icon: typeof Cpu;
}) {
  const t = useT();
  const keys =
    kind === "demo"
      ? {
          title: "analyze.demo.title" as TranslationKey,
          description: "analyze.demo.description" as TranslationKey,
          cta: "analyze.demo.cta" as TranslationKey,
        }
      : {
          title: "analyze.report.title" as TranslationKey,
          description: "analyze.report.description" as TranslationKey,
          cta: "analyze.report.cta" as TranslationKey,
        };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-5 transition-colors",
        active ? "border-primary/50 bg-primary/5" : "border-border bg-card/40",
      )}
    >
      <span
        className={cn(
          "mb-4 flex size-10 items-center justify-center rounded-lg border",
          active
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
        {t(keys.title)}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
        {t(keys.description)}
      </p>
      <Button
        className="mt-5 w-full"
        variant={active ? "default" : "outline"}
        onClick={onSelect}
        aria-pressed={active}
      >
        {t(keys.cta)}
      </Button>
    </div>
  );
}

function AnalyzePage() {
  const t = useT();
  const [kind, setKind] = useState<UploadKind>("demo");
  const intakeRef = useRef<HTMLDivElement>(null);

  function selectPath(nextKind: UploadKind) {
    setKind(nextKind);
    if (nextKind !== "demo") return;
    intakeRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    intakeRef.current?.focus({ preventScroll: true });
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("analyze.eyebrow")}
          title={t("analyze.title")}
          description={t("analyze.description")}
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
              <PathCard
                kind="demo"
                icon={Cpu}
                active={kind === "demo"}
                onSelect={() => selectPath("demo")}
              />
              <PathCard
                kind="report"
                icon={FileImage}
                active={kind === "report"}
                onSelect={() => selectPath("report")}
              />
            </div>

            <p className="flex items-start gap-2.5 rounded-lg border border-border bg-card/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              {t("analyze.recommendation")}
            </p>

            <div ref={intakeRef} tabIndex={-1} className="scroll-mt-24 outline-none">
              <ChartCard
                title={kind === "demo" ? t("pipeline.title") : t("analyze.report.title")}
                subtitle={kind === "demo" ? t("pipeline.subtitle") : undefined}
                showDemoTag={false}
              >
                {/* Demos go through the real ingestion pipeline; the report path
                    is still an interface-only intake surface. */}
                {kind === "demo" ? <DemoIngestPanel /> : <UploadBox kind="report" />}
              </ChartCard>
            </div>
          </div>

          <ChartCard
            title={t("analyze.pipelineTitle")}
            subtitle={t("analyze.pipelineSubtitle")}
            showDemoTag={false}
          >
            <ul className="space-y-4">
              {pipeline.map((step) => (
                <li key={step.labelKey} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
                    <step.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t(step.labelKey)}</p>
                    <p
                      className={cn(
                        "font-mono text-[11px] uppercase tracking-wider",
                        step.done ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {step.done ? t("common.interfaceReady") : t("common.notImplemented")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {!FEATURES.realDemoParser ? (
              <p className="mt-5 rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-warning">{t("analyze.noProcessingTitle")}</span>{" "}
                {t("analyze.noProcessingBody")}
              </p>
            ) : null}
          </ChartCard>

          {/* Integration readiness (Phase 2.1.2): declared sources only.
              No external integration is active, so no connect action exists. */}
          <div className="lg:col-span-3">
            <ChartCard
              title={t("sources.title")}
              subtitle={t("sources.subtitle")}
              showDemoTag={false}
            >
              <SourcesPanel />
              <GamersClubPanel />
              <PlayerIdentityPanel
                observations={[
                  { source: "faceit" },
                  { source: "gamers_club" },
                  { source: "steam" },
                ]}
              />
            </ChartCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

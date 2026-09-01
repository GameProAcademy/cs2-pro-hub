import { createFileRoute } from "@tanstack/react-router";
import { Database, Cpu, ShieldCheck } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { UploadBox } from "@/components/common/UploadBox";
import { AppShell } from "@/components/layout/AppShell";
import { FEATURES } from "@/config/app";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Enviar demo — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Envie seus arquivos .dem de CS2 para análise de performance.",
      },
      { property: "og:title", content: "Enviar demo — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Área de upload de demos .dem do Counter-Strike 2.",
      },
    ],
  }),
  component: UploadPage,
});

const pipeline = [
  { icon: ShieldCheck, label: "Validação do arquivo", status: "Interface pronta" },
  { icon: Cpu, label: "Parser da demo", status: "Não implementado" },
  { icon: Database, label: "Persistência e métricas", status: "Não implementado" },
];

function UploadPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Upload"
          title="Enviar nova demo"
          description="Envie a demo de uma partida de CS2 para gerar métricas, diagnóstico e ajustes no seu plano de treinamento."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <ChartCard title="Arquivo da partida" showDemoTag={false} className="lg:col-span-2">
            <UploadBox />
          </ChartCard>

          <ChartCard
            title="Status do processamento"
            subtitle="O que existe hoje nesta etapa do produto"
            showDemoTag={false}
          >
            <ul className="space-y-4">
              {pipeline.map((step) => (
                <li key={step.label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
                    <step.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {step.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {!FEATURES.demoParser ? (
              <p className="mt-5 rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-warning">Sem processamento.</span> O arquivo
                selecionado permanece apenas no seu navegador: não há upload, storage nem parser
                nesta etapa.
              </p>
            ) : null}
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}

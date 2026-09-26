import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/_authenticated/client-parser-poc")({
  head: () => ({
    meta: [
      { title: "Client Parser POC — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "POC isolada de processamento local de demos CS2, sem upload do arquivo.",
      },
      { property: "og:title", content: "Client Parser POC — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Teste local e isolado do parser de demos CS2 no navegador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientParserPocPage,
});

function ClientParserPocPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="FASE 2.10"
          title="CS2 Pro — Client Parser POC"
          description="Experimento isolado no navegador. Não substitui o parser oficial nem libera dados para análise."
        />
        <p className="border border-warning/30 bg-warning/8 p-4 text-sm text-warning">
          STATUS: FEATURE_DISABLED
        </p>
      </div>
    </AppShell>
  );
}

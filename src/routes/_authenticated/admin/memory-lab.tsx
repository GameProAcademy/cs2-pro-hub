import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { BrowserMemoryLab } from "@/components/pipeline/BrowserMemoryLab";
import { FEATURES } from "@/config/app";

export const Route = createFileRoute("/_authenticated/admin/memory-lab")({
  head: () => ({
    meta: [
      { title: "Browser Memory Lab H.1-M — Administração GamePro" },
      {
        name: "description",
        content: "Laboratório administrativo de medição controlada de memória com fixtures sintéticos.",
      },
      { property: "og:title", content: "Browser Memory Lab H.1-M — Administração GamePro" },
      {
        property: "og:description",
        content: "Medição experimental e local de memória do navegador, sem DEM real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrowserMemoryLabPage,
});

function BrowserMemoryLabPage() {
  const { adminSession } = Route.useRouteContext();

  return (
    <AdminShell session={adminSession}>
      <PageHeader
        eyebrow="FASE 2.7.2H.1-M"
        title="Controlled Browser Memory Measurement"
        description="Este laboratório mede somente observações de memória do navegador durante a materialização de fixtures sintéticos. Nenhum DEM real é processado, enviado ou persistido. Os resultados não autorizam aumento do limite de 128 MiB nem liberam o parser real."
      />
      {FEATURES.clientDemMemoryLab ? (
        <BrowserMemoryLab />
      ) : (
        <section className="border border-warning/30 bg-warning/8 p-5" aria-label="Browser Memory Lab status">
          <p className="font-mono text-xs font-semibold text-warning">STATUS: FEATURE_DISABLED</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Browser Memory Lab desabilitado neste ambiente.
          </p>
        </section>
      )}
    </AdminShell>
  );
}

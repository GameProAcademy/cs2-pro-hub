import { createFileRoute } from "@tanstack/react-router";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FEATURES } from "@/config/app";
import { getProfile } from "@/services/playerService";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Meu Perfil — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Gerencie seus dados de jogador, plataforma principal, role, objetivo e preferências.",
      },
      { property: "og:title", content: "Meu Perfil — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Configurações do jogador no CS2 PRO AI COACH.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const profile = getProfile();

  const fields = [
    { id: "name", label: "Nome", value: profile.name },
    { id: "email", label: "E-mail", value: profile.email },
    { id: "platform", label: "Plataforma principal", value: profile.platform },
    { id: "level", label: "Nível", value: profile.level },
    { id: "goal", label: "Objetivo", value: profile.goal },
    { id: "role", label: "Role", value: profile.role },
    { id: "experience", label: "Experiência", value: profile.experience },
    { id: "country", label: "País", value: profile.country },
  ];

  const preferences = [
    { id: "emailReports", label: "Relatórios por e-mail", value: profile.preferences.emailReports },
    { id: "weeklyPlan", label: "Resumo semanal do plano", value: profile.preferences.weeklyPlan },
    { id: "publicProfile", label: "Perfil público", value: profile.preferences.publicProfile },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Conta"
          title="Meu Perfil"
          description="Estes dados calibram o comparativo do Player DNA e a intensidade do plano de treinamento."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <ChartCard title="Dados do jogador" className="lg:col-span-2" showDemoTag={false}>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => e.preventDefault()}
            >
              {fields.map((f) => (
                <div key={f.id} className="space-y-2">
                  <Label htmlFor={f.id}>{f.label}</Label>
                  <Input id={f.id} defaultValue={f.value} />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!FEATURES.realAuth}>
                  Salvar alterações
                </Button>
                {!FEATURES.realAuth ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Salvar está desativado: não há banco de dados conectado nesta etapa.
                  </p>
                ) : null}
              </div>
            </form>
          </ChartCard>

          <ChartCard title="Preferências" showDemoTag={false}>
            <ul className="space-y-4">
              {preferences.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4">
                  <Label htmlFor={p.id} className="text-sm font-normal text-muted-foreground">
                    {p.label}
                  </Label>
                  <Switch id={p.id} defaultChecked={p.value} />
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FEATURES } from "@/config/app";
import { useT, type TranslationKey } from "@/i18n";
import { getProfile } from "@/services/playerService";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Meu Perfil — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Gerencie seus dados de jogador, plataforma principal, role, objetivo e preferências.",
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
  const t = useT();
  const profile = getProfile();

  const fields: Array<{ id: string; labelKey: TranslationKey; value: string }> = [
    { id: "name", labelKey: "profile.field.name", value: profile.name },
    { id: "email", labelKey: "profile.field.email", value: profile.email },
    { id: "platform", labelKey: "profile.field.platform", value: profile.platform },
    { id: "level", labelKey: "profile.field.level", value: profile.level },
    { id: "goal", labelKey: "profile.field.goal", value: profile.goal },
    { id: "role", labelKey: "profile.field.gameRole", value: profile.role },
    { id: "experience", labelKey: "profile.field.experience", value: profile.experience },
    { id: "country", labelKey: "profile.field.country", value: profile.country },
  ];

  const preferences: Array<{ id: string; labelKey: TranslationKey; value: boolean }> = [
    {
      id: "emailReports",
      labelKey: "profile.pref.emailReports",
      value: profile.preferences.emailReports,
    },
    { id: "weeklyPlan", labelKey: "profile.pref.weeklyPlan", value: profile.preferences.weeklyPlan },
    {
      id: "publicProfile",
      labelKey: "profile.pref.publicProfile",
      value: profile.preferences.publicProfile,
    },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("profile.eyebrow")}
          title={t("profile.title")}
          description={t("profile.description")}
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <ChartCard title={t("profile.playerData")} className="lg:col-span-2" showDemoTag={false}>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
              {fields.map((f) => (
                <div key={f.id} className="space-y-2">
                  <Label htmlFor={f.id}>{t(f.labelKey)}</Label>
                  <Input id={f.id} defaultValue={f.value} />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!FEATURES.profilePersistence}>
                  {t("profile.save")}
                </Button>
                {!FEATURES.profilePersistence ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t("profile.saveDisabled")}
                  </p>
                ) : null}
              </div>
            </form>
          </ChartCard>

          <ChartCard title={t("profile.preferences")} showDemoTag={false}>
            <ul className="space-y-4">
              {preferences.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4">
                  <Label htmlFor={p.id} className="text-sm font-normal text-muted-foreground">
                    {t(p.labelKey)}
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

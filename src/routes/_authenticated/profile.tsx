import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { AvatarCard } from "@/components/profile/AvatarCard";
import { CodeMultiSelect } from "@/components/profile/CodeMultiSelect";
import { CountrySelect } from "@/components/profile/CountrySelect";
import { IdentitiesCard } from "@/components/profile/IdentitiesCard";
import { VerificationCard } from "@/components/profile/VerificationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlayerProfile, useSavePlayerProfile } from "@/hooks/usePlayerProfile";
import { useI18n, useT } from "@/i18n";
import {
  EXPERIENCE_CODES,
  GOAL_CODES,
  PLATFORM_CODES,
  TEAM_ROLE_CODES,
  detectCountryCode,
  experienceLabelKey,
  goalLabelKey,
  platformLabelKey,
  roleLabelKey,
} from "@/lib/profile/taxonomy";
import { evaluateVerification, type IdentitySummary } from "@/lib/profile/verification";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Meu Perfil — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Gerencie seus dados de jogador, plataforma principal, funções no time, objetivos e verificação de identidade.",
      },
      { property: "og:title", content: "Meu Perfil — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Perfil competitivo real e verificação de identidade no CS2 PRO AI COACH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const t = useT();
  const { locale } = useI18n();
  const { data: profile, isLoading } = usePlayerProfile();
  const save = useSavePlayerProfile();

  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [team, setTeam] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [mainPlatform, setMainPlatform] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [goalCodes, setGoalCodes] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Persisted values always win; detection only fills an empty country.
  useEffect(() => {
    if (!profile || hydrated) return;
    if (typeof window !== "undefined") console.log("HYDRATE", JSON.stringify({c: profile.country, p: profile.mainPlatform, e: profile.experience, n: profile.nickname}));
    setDisplayName(profile.displayName ?? "");
    setNickname(profile.nickname ?? "");
    setTeam(profile.team ?? "");
    setCountry(profile.country ?? detectCountryCode({ fallbackLocale: locale }));
    setMainPlatform(profile.mainPlatform);
    setExperience(profile.experience);
    setRoleCodes(profile.roleCodes);
    setGoalCodes(
      [...profile.goals]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((g) => g.code),
    );
    setHydrated(true);
  }, [profile, hydrated, locale]);

  const identitySummaries = useMemo<IdentitySummary[]>(() => {
    const sourceOf: Record<string, string> = {
      FACEIT: "faceit",
      GAMERS_CLUB: "gamers_club",
      STEAM: "steam",
    };
    return (profile?.identities ?? []).map((identity) => ({
      source: sourceOf[identity.platform] ?? identity.platform.toLowerCase(),
      connected: Boolean(identity.external_id || identity.username),
      status: (identity.identity_status ?? "unlinked") as IdentitySummary["status"],
      confidence: Number(identity.confidence_score ?? 0),
      ownershipProven: identity.verification_method === "oauth" && identity.is_verified,
      blockedExternalAccess: identity.platform === "GAMERS_CLUB",
    }));
  }, [profile]);

  const verification = useMemo(
    () =>
      evaluateVerification(
        {
          nickname,
          country,
          mainPlatform,
          experience,
          roleCodes,
          goalCodes,
          primaryGoalCode: goalCodes[0] ?? null,
        },
        identitySummaries,
      ),
    [nickname, country, mainPlatform, experience, roleCodes, goalCodes, identitySummaries],
  );

  const busy = save.isPending;

  return (
    <AppShell>
      <div className="space-y-8">
        <span data-testid="dbg">{JSON.stringify({country, mainPlatform, experience, hydrated})}</span>
        <PageHeader
          eyebrow={t("profile.eyebrow")}
          title={t("profile.title")}
          description={t("profile.description")}
        />

        {isLoading && !profile ? (
          <p className="text-sm text-muted-foreground">{t("profile.loading")}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <ChartCard
              title={t("profile.section.identity")}
              subtitle={t("profile.section.identityDesc")}
              className="lg:col-span-2"
              showDemoTag={false}
            >
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate({
                    displayName,
                    nickname,
                    team,
                    country: (country ?? null) as never,
                    mainPlatform: (mainPlatform ?? null) as never,
                    experience: (experience ?? null) as never,
                    roleCodes: roleCodes as never,
                    goalCodes: goalCodes as never,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="displayName">{t("profile.field.displayName")}</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">{t("profile.field.nickname")}</Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("profile.field.email")}</Label>
                  <Input id="email" value={profile?.email ?? ""} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">{t("profile.field.country")}</Label>
                  <CountrySelect value={country} onChange={setCountry} disabled={busy} />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t("profile.section.competitive")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.section.competitiveDesc")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mainPlatform">{t("profile.field.mainPlatform")}</Label>
                  <Select
                    value={mainPlatform ?? ""}
                    onValueChange={setMainPlatform}
                    disabled={busy}
                  >
                    <SelectTrigger id="mainPlatform">
                      <SelectValue placeholder={t("profile.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(platformLabelKey(code))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience">{t("profile.field.experienceCode")}</Label>
                  <Select
                    value={experience ?? ""}
                    onValueChange={setExperience}
                    disabled={busy}
                  >
                    <SelectTrigger id="experience">
                      <SelectValue placeholder={t("profile.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPERIENCE_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(experienceLabelKey(code))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="team">{t("profile.field.team")}</Label>
                  <Input
                    id="team"
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("profile.field.teamRoles")}</Label>
                  <CodeMultiSelect
                    codes={TEAM_ROLE_CODES}
                    selected={roleCodes}
                    onChange={setRoleCodes}
                    labelKey={roleLabelKey}
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("profile.field.teamRolesHint")}
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("profile.field.goals")}</Label>
                  <CodeMultiSelect
                    codes={GOAL_CODES}
                    selected={goalCodes}
                    onChange={setGoalCodes}
                    labelKey={goalLabelKey}
                    disabled={busy}
                    primaryFirst
                    primaryLabel={t("profile.primaryGoal")}
                  />
                  <p className="text-xs text-muted-foreground">{t("profile.field.goalsHint")}</p>
                </div>

                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    {t("profile.save")}
                  </Button>
                  {save.isSuccess ? (
                    <p className="mt-3 text-xs text-success">{t("profile.saved")}</p>
                  ) : null}
                  {save.isError ? (
                    <p role="alert" className="mt-3 text-xs text-destructive">
                      {t("profile.saveError")}
                    </p>
                  ) : null}
                </div>
              </form>
            </ChartCard>

            <div className="space-y-5">
              <ChartCard title={t("profile.preferences")} showDemoTag={false}>
                <AvatarCard embedded />
              </ChartCard>
              <VerificationCard result={verification} />
            </div>

            <div className="lg:col-span-3">
              <IdentitiesCard
                identities={profile?.identities ?? []}
                connections={profile?.connections ?? []}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

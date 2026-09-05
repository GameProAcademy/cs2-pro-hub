import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { AvatarCard } from "@/components/profile/AvatarCard";
import { CodeMultiSelect } from "@/components/profile/CodeMultiSelect";
import { CountrySelect } from "@/components/profile/CountrySelect";
import { SteamPanel } from "@/components/integrations/SteamPanel";
import { IdentitiesCard } from "@/components/profile/IdentitiesCard";
import { PasswordCard } from "@/components/profile/PasswordCard";
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
  LEVEL_CODES,
  PLATFORM_CODES,
  TEAM_ROLE_CODES,
  detectCountryCode,
  experienceLabelKey,
  goalLabelKey,
  levelLabelKey,
  platformLabelKey,
  roleLabelKey,
} from "@/lib/profile/taxonomy";
import { hasOwnershipProof } from "@/lib/identity/ownership";
import { evaluateVerification, type IdentitySummary } from "@/lib/profile/verification";

interface ProfileSearch {
  connection?: "steam_success" | "steam_error";
  reason?: string;
}

export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: (search: Record<string, unknown>): ProfileSearch => {
    const connection = search["connection"];
    const reason = search["reason"];
    return {
      ...(connection === "steam_success" || connection === "steam_error" ? { connection } : {}),
      ...(typeof reason === "string" && /^[a-z_]{1,40}$/.test(reason) ? { reason } : {}),
    };
  },
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
  const search = Route.useSearch();
  const steamCallback = search.connection
    ? {
        status: search.connection === "steam_success" ? ("success" as const) : ("error" as const),
        ...(search.reason ? { reason: search.reason } : {}),
      }
    : undefined;
  const { locale } = useI18n();
  const { data: profile, isLoading, isError } = usePlayerProfile();
  const save = useSavePlayerProfile();

  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [team, setTeam] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [mainPlatform, setMainPlatform] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [goalCodes, setGoalCodes] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Persisted values always win; detection only fills an empty country.
  useEffect(() => {
    if (!profile || hydrated) return;
    setDisplayName(profile.displayName ?? "");
    setNickname(profile.nickname ?? "");
    setTeam(profile.team ?? "");
    setCountry(profile.country ?? detectCountryCode({ fallbackLocale: locale }));
    setMainPlatform(profile.mainPlatform);
    setCurrentLevel(profile.currentLevel);
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
      // Single source of truth: OAuth (FACEIT) and OpenID (Steam) both prove
      // ownership; correlation never does.
      ownershipProven: hasOwnershipProof(identity),
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
        <PageHeader
          eyebrow={t("profile.eyebrow")}
          title={t("profile.title")}
          description={t("profile.description")}
        />

        {isError && !profile ? (
          <p role="alert" className="text-sm text-destructive">
            {t("profile.loadError")}
          </p>
        ) : isLoading && !profile ? (
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
                    currentLevel: (currentLevel ?? null) as never,
                    primaryGoalCode: (goalCodes[0] ?? null) as never,
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
                    onValueChange={(value) => {
                      // Radix mirrors the value in a hidden native select inside the
                      // form and emits "" on mount; an empty code is never valid.
                      if (value) setMainPlatform(value);
                    }}
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
                  <Label htmlFor="currentLevel">{t("profile.field.currentLevel")}</Label>
                  <Select
                    value={currentLevel ?? ""}
                    onValueChange={(value) => {
                      if (value) setCurrentLevel(value);
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger id="currentLevel">
                      <SelectValue placeholder={t("profile.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVEL_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(levelLabelKey(code))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.field.currentLevelHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience">{t("profile.field.experienceCode")}</Label>
                  <Select
                    value={experience ?? ""}
                    onValueChange={(value) => {
                      if (value) setExperience(value);
                    }}
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
              <PasswordCard />
            </div>

            <div className="lg:col-span-2">
              <SteamPanel callback={steamCallback} />
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

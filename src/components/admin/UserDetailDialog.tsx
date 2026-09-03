/**
 * Complete administrative view of one player.
 *
 * Data comes exclusively from `getAdminUserDetail` (server-side, admin RLS
 * context). Nothing here is mock data: every empty section renders a real
 * empty state instead of invented values.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErrorState, LoadingState } from "@/components/common/States";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import type { DnaDimension } from "@/types";
import {
  getAdminUserDetail,
  resetAdminUserPassword,
  setAdminUserStatus,
  updateAdminUser,
  type AdminIdentity,
  type AdminPlayerDetail,
  type AdminProfileDetail,
  type AdminRole,
  type AdminSession,
} from "@/lib/admin.functions";
import { LOCALE_OPTIONS } from "@/i18n/config";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="break-words text-sm text-foreground">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{children}</h3>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}

const DNA_KEYS = [
  "aim",
  "dueling",
  "survivability",
  "positioning",
  "utility",
  "decision_making",
  "teamplay",
  "economy",
  "clutch",
  "consistency",
] as const;

const METRIC_FIELDS: Array<[string, TranslationKey]> = [
  ["kills", "admin.metrics.kills"],
  ["deaths", "admin.metrics.deaths"],
  ["assists", "admin.metrics.assists"],
  ["adr", "admin.metrics.adr"],
  ["kast", "admin.metrics.kast"],
  ["hs_percent", "admin.metrics.hs"],
  ["first_kills", "admin.metrics.firstKills"],
  ["first_deaths", "admin.metrics.firstDeaths"],
  ["opening_success", "admin.metrics.openingSuccess"],
  ["clutches", "admin.metrics.clutches"],
  ["multi_kills", "admin.metrics.multiKills"],
  ["utility_damage", "admin.metrics.utilityDamage"],
  ["flash_assists", "admin.metrics.flashAssists"],
  ["grenade_damage", "admin.metrics.grenadeDamage"],
  ["ct_rating", "admin.metrics.ctRating"],
  ["t_rating", "admin.metrics.tRating"],
  ["rating", "admin.metrics.rating"],
];

export function UserDetailDialog({
  userId,
  session,
  onClose,
}: {
  userId: string;
  session: AdminSession;
  onClose: () => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const queryClient = useQueryClient();
  const dateFormat = new Intl.DateTimeFormat(intlTag, { dateStyle: "short", timeStyle: "short" });
  const dayFormat = new Intl.DateTimeFormat(intlTag, { dateStyle: "short" });
  const dash = t("admin.value.none");

  const detail = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => getAdminUserDetail({ data: { userId } }),
  });

  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "status"; status: "active" | "inactive" } | { kind: "reset" } | null
  >(null);

  const [form, setForm] = useState({
    display_name: "",
    nickname: "",
    country: "",
    locale: "en",
    playerNickname: "",
    main_platform: "",
    current_level: "",
    competitive_goal: "",
    gameRole: "",
    experience: "",
    team: "",
  });

  useEffect(() => {
    const profile = detail.data?.profile as AdminProfileDetail | undefined;
    const player = detail.data?.player as AdminPlayerDetail | null | undefined;
    if (!profile) return;
    setForm({
      display_name: profile.display_name ?? "",
      nickname: profile.nickname ?? "",
      country: profile.country ?? "",
      locale: profile.locale ?? "en",
      playerNickname: player?.nickname ?? "",
      main_platform: player?.main_platform ?? "",
      current_level: player?.current_level ?? "",
      competitive_goal: player?.competitive_goal ?? "",
      gameRole: player?.role ?? "",
      experience: player?.experience ?? "",
      team: player?.team ?? "",
    });
  }, [detail.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  function handleError() {
    setMessage(null);
    setError(t("admin.error.generic"));
  }

  const save = useMutation({
    mutationFn: () =>
      updateAdminUser({
        data: {
          userId,
          profile: {
            display_name: form.display_name || null,
            nickname: form.nickname || null,
            country: form.country || null,
            locale: form.locale,
          },
          player: {
            nickname: form.playerNickname || null,
            main_platform: form.main_platform || null,
            current_level: form.current_level || null,
            competitive_goal: form.competitive_goal || null,
            role: form.gameRole || null,
            experience: form.experience || null,
            team: form.team || null,
          },
        },
      }),
    onSuccess: () => {
      setError(null);
      setMessage(t("admin.msg.saved"));
      setEditing(false);
      refresh();
    },
    onError: handleError,
  });

  const changeStatus = useMutation({
    mutationFn: (status: "active" | "inactive") => setAdminUserStatus({ data: { userId, status } }),
    onSuccess: () => {
      setError(null);
      setMessage(t("admin.msg.statusUpdated"));
      refresh();
    },
    onError: handleError,
  });

  const resetPassword = useMutation({
    mutationFn: () =>
      resetAdminUserPassword({ data: { userId, redirectTo: window.location.origin } }),
    onSuccess: () => {
      setError(null);
      setMessage(t("admin.msg.resetSent"));
    },
    onError: handleError,
  });

  const profile = detail.data?.profile as AdminProfileDetail | undefined;
  const player = detail.data?.player as AdminPlayerDetail | null | undefined;
  const identities = (detail.data?.identities ?? []) as AdminIdentity[];
  const uploads = detail.data?.uploads ?? [];
  const matches = detail.data?.matches ?? [];
  const metrics = detail.data?.metrics ?? [];
  const analyses = detail.data?.analyses ?? [];
  const findings = detail.data?.findings ?? [];
  const dna = detail.data?.dna ?? null;
  const score = detail.data?.score ?? null;
  const plans = detail.data?.plans ?? [];
  const conversations = detail.data?.conversations ?? [];
  const audit = detail.data?.audit ?? [];
  const isSelf = profile?.id === session.userId;
  const busy = save.isPending || changeStatus.isPending || resetPassword.isPending;

  /** DNA slugs are translated; any other skill slug is shown verbatim. */
  const skillLabel = (slug: string | null | undefined) => {
    if (!slug) return dash;
    return (DNA_KEYS as readonly string[]).includes(slug)
      ? t(dnaLabelKey(slug as DnaDimension))
      : slug;
  };

  const tabs: Array<[string, TranslationKey]> = [
    ["overview", "admin.tab.overview"],
    ["cs2", "admin.tab.cs2"],
    ["uploads", "admin.tab.uploads"],
    ["matches", "admin.tab.matches"],
    ["metrics", "admin.tab.metrics"],
    ["analyses", "admin.tab.analyses"],
    ["dna", "admin.tab.dna"],
    ["training", "admin.tab.training"],
    ["coach", "admin.tab.coach"],
    ["audit", "admin.tab.audit"],
  ];

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4 text-left uppercase tracking-tight">
            <UserAvatar
              source={profile?.avatar_url ?? null}
              name={profile?.display_name ?? profile?.nickname ?? null}
              size={64}
            />
            <span className="min-w-0">
              <span className="block truncate">
                {profile?.display_name ||
                  profile?.nickname ||
                  profile?.email ||
                  t("admin.action.view")}
              </span>
              <span className="block truncate text-xs font-normal normal-case tracking-normal text-muted-foreground">
                {profile?.email || dash}
                {profile
                  ? ` · ${t(`admin.status.${profile.status as "active" | "inactive"}`)}`
                  : null}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {detail.isLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : detail.isError || !profile ? (
          <ErrorState
            title={t("common.errorTitle")}
            description={t("admin.error.generic")}
            onRetry={() => void detail.refetch()}
          />
        ) : (
          <div className="space-y-5">
            {message ? <p className="text-sm text-primary">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Tabs defaultValue="overview">
              <TabsList className="flex h-auto w-full flex-nowrap justify-start overflow-x-auto">
                {tabs.map(([value, key]) => (
                  <TabsTrigger key={value} value={value} className="shrink-0 text-xs">
                    {t(key)}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* A. Profile */}
              <TabsContent value="overview" className="space-y-4 pt-4">
                <SectionTitle>{t("admin.detail.account")}</SectionTitle>
                {editing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="dn">{t("admin.field.displayName")}</Label>
                      <Input
                        id="dn"
                        value={form.display_name}
                        onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="nk">{t("admin.table.nickname")}</Label>
                      <Input
                        id="nk"
                        value={form.nickname}
                        onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ct">{t("admin.table.country")}</Label>
                      <Input
                        id="ct"
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lc">{t("admin.field.locale")}</Label>
                      <select
                        id="lc"
                        value={form.locale}
                        onChange={(e) => setForm({ ...form, locale: e.target.value })}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {LOCALE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label={t("admin.table.name")} value={profile.display_name || dash} />
                    <Field label={t("admin.table.email")} value={profile.email || dash} />
                    <Field label={t("admin.table.nickname")} value={profile.nickname || dash} />
                    <Field label={t("admin.table.country")} value={profile.country || dash} />
                    <Field label={t("admin.field.locale")} value={profile.locale} />
                    <Field
                      label={t("admin.table.role")}
                      value={t(`admin.role.${profile.role as AdminRole}`)}
                    />
                    <Field
                      label={t("admin.table.status")}
                      value={t(`admin.status.${profile.status as "active" | "inactive"}`)}
                    />
                    <Field
                      label={t("admin.table.createdAt")}
                      value={dateFormat.format(new Date(profile.created_at))}
                    />
                    <Field
                      label={t("admin.table.lastLogin")}
                      value={
                        profile.last_login_at
                          ? dateFormat.format(new Date(profile.last_login_at))
                          : t("admin.value.never")
                      }
                    />
                  </div>
                )}
              </TabsContent>

              {/* B + C. CS2 profile and identities */}
              <TabsContent value="cs2" className="space-y-6 pt-4">
                <section className="space-y-3">
                  <SectionTitle>{t("admin.detail.cs2")}</SectionTitle>
                  {editing ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["playerNickname", "admin.table.nickname"],
                          ["main_platform", "admin.field.mainPlatform"],
                          ["current_level", "admin.field.currentLevel"],
                          ["competitive_goal", "admin.field.goal"],
                          ["gameRole", "admin.field.gameRole"],
                          ["experience", "admin.field.experience"],
                          ["team", "admin.field.team"],
                        ] as const
                      ).map(([key, labelKey]) => (
                        <div key={key}>
                          <Label htmlFor={key}>{t(labelKey)}</Label>
                          <Input
                            id={key}
                            value={form[key]}
                            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label={t("admin.table.nickname")} value={player?.nickname || dash} />
                      <Field
                        label={t("admin.field.mainPlatform")}
                        value={player?.main_platform || dash}
                      />
                      <Field
                        label={t("admin.field.currentLevel")}
                        value={player?.current_level || dash}
                      />
                      <Field label={t("admin.field.goal")} value={player?.competitive_goal || dash} />
                      <Field label={t("admin.field.gameRole")} value={player?.role || dash} />
                      <Field label={t("admin.field.experience")} value={player?.experience || dash} />
                      <Field label={t("admin.field.team")} value={player?.team || dash} />
                      <Field
                        label={t("admin.field.faceit")}
                        value={player?.faceit_username || dash}
                      />
                      <Field
                        label={t("admin.field.faceitId")}
                        value={player?.faceit_player_id || dash}
                      />
                      <Field
                        label={t("admin.field.gamersclub")}
                        value={player?.gamersclub_username || dash}
                      />
                      <Field
                        label={t("admin.field.gamersclubId")}
                        value={player?.gamersclub_player_id || dash}
                      />
                      <Field label={t("admin.field.steam")} value={player?.steam_id || dash} />
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <SectionTitle>{t("admin.detail.identities")}</SectionTitle>
                  {identities.length === 0 ? (
                    <Empty label={t("admin.detail.noIdentities")} />
                  ) : (
                    <ul className="space-y-2">
                      {identities.map((identity) => (
                        <li
                          key={identity.id}
                          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-5"
                        >
                          <Field label={t("admin.detail.platform")} value={identity.platform} />
                          <Field
                            label={t("admin.detail.username")}
                            value={identity.username || dash}
                          />
                          <Field
                            label={t("admin.detail.externalId")}
                            value={identity.external_id || dash}
                          />
                          <Field
                            label={t("admin.detail.url")}
                            value={identity.profile_url || dash}
                          />
                          <Field
                            label={t("admin.detail.verifiedLabel")}
                            value={
                              identity.is_verified
                                ? t("admin.detail.verified")
                                : t("admin.detail.notVerified")
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </TabsContent>

              {/* D. Uploads */}
              <TabsContent value="uploads" className="space-y-3 pt-4">
                <SectionTitle>{t("admin.tab.uploads")}</SectionTitle>
                {uploads.length === 0 ? (
                  <Empty label={t("admin.empty.uploads")} />
                ) : (
                  <ul className="space-y-2">
                    {uploads.map((upload) => (
                      <li
                        key={upload.id}
                        className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-4"
                      >
                        <Field label={t("admin.field.file")} value={upload.file_name} />
                        <Field label={t("admin.field.type")} value={upload.type} />
                        <Field label={t("admin.field.source")} value={upload.source} />
                        <Field
                          label={t("admin.field.size")}
                          value={
                            upload.file_size
                              ? `${Math.round(upload.file_size / 1024)} KB`
                              : dash
                          }
                        />
                        <Field label={t("admin.field.mime")} value={upload.mime_type || dash} />
                        <Field label={t("admin.table.status")} value={upload.status} />
                        <Field
                          label={t("admin.table.createdAt")}
                          value={dateFormat.format(new Date(upload.created_at))}
                        />
                        <Field
                          label={t("admin.field.processedAt")}
                          value={
                            upload.processed_at
                              ? dateFormat.format(new Date(upload.processed_at))
                              : dash
                          }
                        />
                        {upload.error_message ? (
                          <div className="sm:col-span-3 lg:col-span-4">
                            <Field
                              label={t("admin.field.error")}
                              value={upload.error_message}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* E. Matches */}
              <TabsContent value="matches" className="space-y-3 pt-4">
                <SectionTitle>{t("admin.tab.matches")}</SectionTitle>
                {matches.length === 0 ? (
                  <Empty label={t("admin.empty.matches")} />
                ) : (
                  <ul className="space-y-2">
                    {matches.map((match) => (
                      <li
                        key={match.id}
                        className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-4"
                      >
                        <Field label={t("admin.field.map")} value={match.map || dash} />
                        <Field
                          label={t("admin.field.matchDate")}
                          value={match.match_date ? dayFormat.format(new Date(match.match_date)) : dash}
                        />
                        <Field label={t("admin.detail.platform")} value={match.platform || dash} />
                        <Field label={t("admin.field.result")} value={match.result || dash} />
                        <Field
                          label={t("admin.field.score")}
                          value={
                            match.score_player !== null && match.score_opponent !== null
                              ? `${match.score_player} : ${match.score_opponent}`
                              : dash
                          }
                        />
                        <Field
                          label={t("admin.field.rounds")}
                          value={match.rounds !== null ? String(match.rounds) : dash}
                        />
                        <Field
                          label={t("admin.field.externalMatchId")}
                          value={match.external_match_id || dash}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* F. Metrics */}
              <TabsContent value="metrics" className="space-y-3 pt-4">
                <SectionTitle>{t("admin.tab.metrics")}</SectionTitle>
                {metrics.length === 0 ? (
                  <Empty label={t("admin.empty.metrics")} />
                ) : (
                  <ul className="space-y-2">
                    {metrics.map((metric) => (
                      <li
                        key={metric.id}
                        className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-6"
                      >
                        {METRIC_FIELDS.map(([key, labelKey]) => {
                          const value = (metric as unknown as Record<string, number | null>)[key];
                          return (
                            <Field
                              key={key}
                              label={t(labelKey)}
                              value={value === null || value === undefined ? dash : String(value)}
                            />
                          );
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* G + H. Analyses and findings */}
              <TabsContent value="analyses" className="space-y-6 pt-4">
                <section className="space-y-3">
                  <SectionTitle>{t("admin.tab.analyses")}</SectionTitle>
                  {analyses.length === 0 ? (
                    <Empty label={t("admin.empty.analyses")} />
                  ) : (
                    <ul className="space-y-2">
                      {analyses.map((analysis) => (
                        <li
                          key={analysis.id}
                          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3"
                        >
                          <Field
                            label={t("admin.field.version")}
                            value={analysis.analysis_version}
                          />
                          <Field label={t("admin.table.status")} value={analysis.status} />
                          <Field
                            label={t("admin.field.confidence")}
                            value={analysis.confidence !== null ? String(analysis.confidence) : dash}
                          />
                          <Field
                            label={t("admin.table.createdAt")}
                            value={dateFormat.format(new Date(analysis.created_at))}
                          />
                          <Field
                            label={t("admin.field.sourceUpload")}
                            value={analysis.source_upload_id || dash}
                          />
                          <div className="sm:col-span-3">
                            <Field
                              label={t("admin.field.summary")}
                              value={analysis.summary || dash}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="space-y-3">
                  <SectionTitle>{t("admin.detail.findings")}</SectionTitle>
                  {findings.length === 0 ? (
                    <Empty label={t("admin.empty.findings")} />
                  ) : (
                    <ul className="space-y-2">
                      {findings.map((finding) => (
                        <li
                          key={finding.id}
                          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3"
                        >
                          <Field label={t("admin.field.title")} value={finding.title} />
                          <Field
                            label={t("admin.field.skill")}
                            value={skillLabel(finding.skill_slug)}
                          />
                          <Field label={t("admin.field.type")} value={finding.type} />
                          <Field
                            label={t("admin.field.priority")}
                            value={finding.priority || dash}
                          />
                          <Field label={t("admin.field.impact")} value={finding.impact || dash} />
                          <Field
                            label={t("admin.field.confidence")}
                            value={finding.confidence !== null ? String(finding.confidence) : dash}
                          />
                          <div className="sm:col-span-3">
                            <Field
                              label={t("admin.field.description")}
                              value={finding.description || dash}
                            />
                          </div>
                          {finding.evidence ? (
                            <div className="sm:col-span-3">
                              <Field
                                label={t("admin.field.evidence")}
                                value={JSON.stringify(finding.evidence)}
                              />
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </TabsContent>

              {/* I + J. DNA and score */}
              <TabsContent value="dna" className="space-y-6 pt-4">
                <section className="space-y-3">
                  <SectionTitle>{t("admin.detail.dna")}</SectionTitle>
                  {!dna ? (
                    <Empty label={t("admin.empty.dna")} />
                  ) : (
                    <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-5">
                      {DNA_KEYS.map((key) => (
                        <Field
                          key={key}
                          label={t(dnaLabelKey(key))}
                          value={dna[key] !== null && dna[key] !== undefined ? String(dna[key]) : dash}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <SectionTitle>{t("admin.detail.score")}</SectionTitle>
                  {!score ? (
                    <Empty label={t("admin.empty.score")} />
                  ) : (
                    <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-4">
                      <Field label={t("admin.field.score")} value={String(score.score)} />
                      <Field
                        label={t("admin.field.percentile")}
                        value={score.percentile !== null ? String(score.percentile) : dash}
                      />
                      <Field label={t("admin.field.tier")} value={score.tier || dash} />
                      <Field
                        label={t("admin.field.date")}
                        value={dateFormat.format(new Date(score.created_at))}
                      />
                    </div>
                  )}
                </section>
              </TabsContent>

              {/* K. Training */}
              <TabsContent value="training" className="space-y-4 pt-4">
                <SectionTitle>{t("admin.detail.training")}</SectionTitle>
                {plans.length === 0 ? (
                  <Empty label={t("admin.empty.training")} />
                ) : (
                  plans.map((plan) => {
                    const done = plan.items.filter((i) => i.status === "done").length;
                    const progress = plan.items.length
                      ? Math.round((done / plan.items.length) * 100)
                      : 0;
                    return (
                      <div key={plan.id} className="space-y-3 rounded-md border border-border p-3">
                        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          <Field
                            label={t("training.plan")}
                            value={`${plan.horizon} ${t("training.days")}`}
                          />
                          <Field label={t("admin.table.status")} value={plan.status} />
                          <Field
                            label={t("training.objective")}
                            value={plan.objective || plan.title || dash}
                          />
                          <Field label={t("training.progress")} value={`${progress}%`} />
                          <Field
                            label={t("admin.field.start")}
                            value={plan.start_date ? dayFormat.format(new Date(plan.start_date)) : dash}
                          />
                          <Field
                            label={t("admin.field.end")}
                            value={plan.end_date ? dayFormat.format(new Date(plan.end_date)) : dash}
                          />
                        </div>
                        {plan.items.length === 0 ? (
                          <Empty label={t("admin.empty.planItems")} />
                        ) : (
                          <ul className="space-y-2">
                            {plan.items.map((item) => (
                              <li
                                key={item.id}
                                className="grid gap-3 rounded-md bg-secondary/40 p-3 sm:grid-cols-3 lg:grid-cols-5"
                              >
                                <Field label={t("admin.field.title")} value={item.title} />
                                <Field
                                  label={t("admin.field.skill")}
                                  value={skillLabel(item.skill_slug)}
                                />
                                <Field
                                  label={t("admin.field.lesson")}
                                  value={item.lesson_id || dash}
                                />
                                <Field
                                  label={t("admin.field.targetMetric")}
                                  value={item.target_metric || dash}
                                />
                                <Field
                                  label={t("admin.field.targetValue")}
                                  value={item.target_value || dash}
                                />
                                <Field label={t("admin.table.status")} value={item.status} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>

              {/* L. Coach */}
              <TabsContent value="coach" className="space-y-3 pt-4">
                <SectionTitle>{t("admin.detail.coach")}</SectionTitle>
                {conversations.length === 0 ? (
                  <Empty label={t("admin.empty.coach")} />
                ) : (
                  <ul className="space-y-2">
                    {conversations.map((conversation) => (
                      <li
                        key={conversation.id}
                        className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3"
                      >
                        <Field
                          label={t("admin.field.conversationTitle")}
                          value={conversation.title || dash}
                        />
                        <Field
                          label={t("admin.field.messages")}
                          value={String(conversation.messageCount)}
                        />
                        <Field
                          label={t("admin.field.updatedAt")}
                          value={dateFormat.format(new Date(conversation.updated_at))}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* M. Audit history */}
              <TabsContent value="audit" className="space-y-3 pt-4">
                <SectionTitle>{t("admin.detail.auditHistory")}</SectionTitle>
                {audit.length === 0 ? (
                  <Empty label={t("admin.empty.audit")} />
                ) : (
                  <ul className="space-y-2">
                    {audit.map((entry) => (
                      <li
                        key={entry.id}
                        className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3"
                      >
                        <Field label={t("admin.audit.action")} value={entry.action} />
                        <Field
                          label={t("admin.audit.date")}
                          value={dateFormat.format(new Date(entry.created_at))}
                        />
                        <Field label={t("admin.audit.admin")} value={entry.admin_user_id} />
                        {entry.metadata ? (
                          <div className="sm:col-span-3">
                            <Field
                              label={t("admin.audit.metadata")}
                              value={JSON.stringify(entry.metadata)}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>

            <section className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {editing ? (
                <>
                  <Button disabled={busy} onClick={() => save.mutate()}>
                    {save.isPending ? t("admin.action.saving") : t("admin.action.save")}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                    {t("admin.action.cancel")}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                    {t("admin.action.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: "reset" })}
                  >
                    {resetPassword.isPending
                      ? t("common.loading")
                      : t("admin.action.resetPassword")}
                  </Button>
                  {!isSelf && profile.role === "player" ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          kind: "status",
                          status: profile.status === "active" ? "inactive" : "active",
                        })
                      }
                    >
                      {profile.status === "active"
                        ? t("admin.action.deactivate")
                        : t("admin.action.activate")}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("admin.masterOnly")}</span>
                  )}
                  <Button variant="ghost" onClick={onClose}>
                    {t("admin.action.close")}
                  </Button>
                </>
              )}
            </section>
          </div>
        )}

        <AlertDialog open={confirm !== null} onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === "reset"
                  ? t("admin.confirm.resetTitle")
                  : confirm?.status === "inactive"
                    ? t("admin.confirm.deactivateTitle")
                    : t("admin.confirm.activateTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === "reset"
                  ? t("admin.confirm.resetBody")
                  : confirm?.status === "inactive"
                    ? t("admin.confirm.deactivateBody")
                    : t("admin.confirm.activateBody")}
                <br />
                <strong>{t("admin.confirm.affected")}:</strong>{" "}
                {profile?.display_name || profile?.nickname || profile?.email}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("admin.action.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!confirm) return;
                  if (confirm.kind === "reset") resetPassword.mutate();
                  else changeStatus.mutate(confirm.status);
                  setConfirm(null);
                }}
              >
                {t("admin.action.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

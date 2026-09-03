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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, useT } from "@/i18n";
import {
  getAdminUserDetail,
  setAdminUserStatus,
  updateAdminUser,
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
      <p className="truncate text-sm text-foreground">{value}</p>
    </div>
  );
}

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
  const dash = t("admin.value.none");

  const detail = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => getAdminUserDetail({ data: { userId } }),
  });

  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "status";
    status: "active" | "inactive";
  } | null>(null);

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
    const profile = detail.data?.profile as any;
    const player = detail.data?.player as any;
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

  const profile = detail.data?.profile as any;
  const player = detail.data?.player as any;
  const identities = (detail.data?.identities ?? []) as any[];
  const isSelf = profile?.id === session.userId;
  const busy = save.isPending || changeStatus.isPending;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight">
            {profile?.display_name || profile?.nickname || profile?.email || t("admin.action.view")}
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
          <div className="space-y-6">
            {message ? <p className="text-sm text-primary">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <section className="space-y-3">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                {t("admin.detail.account")}
              </h3>
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
            </section>

            <section className="space-y-3">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                {t("admin.detail.cs2")}
              </h3>
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
                  <Field label={t("admin.field.faceit")} value={player?.faceit_username || dash} />
                  <Field
                    label={t("admin.field.gamersclub")}
                    value={player?.gamersclub_username || dash}
                  />
                  <Field label={t("admin.field.steam")} value={player?.steam_id || dash} />
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                {t("admin.detail.identities")}
              </h3>
              {identities.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.detail.noIdentities")}</p>
              ) : (
                <ul className="space-y-2">
                  {identities.map((identity) => (
                    <li
                      key={identity.id}
                      className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-4"
                    >
                      <Field label={t("admin.detail.platform")} value={identity.platform} />
                      <Field label={t("admin.detail.username")} value={identity.username || dash} />
                      <Field
                        label={t("admin.detail.externalId")}
                        value={identity.external_id || dash}
                      />
                      <Field
                        label={
                          identity.is_verified
                            ? t("admin.detail.verified")
                            : t("admin.detail.notVerified")
                        }
                        value={identity.profile_url || dash}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
                <Button variant="outline" onClick={() => setEditing(true)}>
                  {t("admin.action.edit")}
                </Button>
              )}

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
              ) : null}
            </section>
          </div>
        )}

        <AlertDialog
          open={confirm !== null}
          onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.status === "inactive"
                  ? t("admin.confirm.deactivateTitle")
                  : t("admin.confirm.activateTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.status === "inactive"
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
                  changeStatus.mutate(confirm.status);
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

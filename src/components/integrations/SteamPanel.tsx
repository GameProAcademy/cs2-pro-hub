/**
 * FASE 2.5 — Steam account card.
 *
 * Honest UI:
 *  - the sign-in button only exists when the server environment is actually
 *    configured; otherwise the card states plainly that linking is unavailable;
 *  - the SteamID64 is shown masked, and only revealed on the owner's request;
 *  - a missing value is "—", never a zero and never an invented nickname;
 *  - it says out loud that Steam proves WHO you are, not HOW you played.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, ExternalLink, Link2, Link2Off, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { getSteamConnection, unlinkSteamConnection } from "@/lib/steam.functions";
import type { SteamConnectionView } from "@/lib/steam/steam.types";
import { callbackReason, type SteamErrorCode } from "@/lib/steam/steam.errors";

const DASH = "—";

export interface SteamPanelProps {
  /** Result of the OpenID callback redirect, when the user just came back. */
  callback?: { status: "success" | "error"; reason?: string } | undefined;
}

export function SteamPanel({ callback }: SteamPanelProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const connection = useQuery<SteamConnectionView>({
    queryKey: ["steam", "connection"],
    queryFn: () => getSteamConnection(),
  });

  const link = useMutation({
    mutationFn: async () => {
      const { startSteamConnection } = await import("@/lib/steam.functions");
      return startSteamConnection();
    },
    onSuccess: (result) => {
      if (result.ok && result.redirectUrl) {
        // Full-page navigation: Steam refuses to be framed.
        window.location.assign(result.redirectUrl);
        return;
      }
      setReason(callbackReason((result.errorCode ?? "STEAM_INTERNAL_ERROR") as SteamErrorCode));
    },
    onError: () => setReason("error"),
  });

  const unlink = useMutation({
    mutationFn: () => unlinkSteamConnection(),
    onSuccess: (result) => {
      setReason(result.ok ? null : callbackReason(result.errorCode ?? "STEAM_INTERNAL_ERROR"));
      setRevealed(false);
      void queryClient.invalidateQueries({ queryKey: ["steam", "connection"] });
      void queryClient.invalidateQueries({ queryKey: ["player", "profile"] });
    },
    onError: () => setReason("error"),
  });

  const view = connection.data;
  const configured = view?.openidReady ?? false;
  const connected = view?.connected ?? false;
  const busy = link.isPending || unlink.isPending || connection.isLoading;
  const activeReason = reason ?? (callback?.status === "error" ? (callback.reason ?? "error") : null);

  return (
    <ChartCard
      title={t("steam.title")}
      subtitle={t("steam.subtitle")}
      showDemoTag={false}
    >
      <div className="space-y-4">
        {/* State line */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {connected ? (
              <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {view?.personaName ?? t("identity.source.steam")}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {connected
                  ? revealed
                    ? (view?.steamId64 ?? DASH)
                    : (view?.steamId64Masked ?? DASH)
                  : t("identity.notConnected")}
              </p>
            </div>
          </div>
          <span className="rounded-md border border-border bg-secondary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t(`steam.state.${view?.integrationState ?? "not_configured"}` as TranslationKey)}
          </span>
        </div>

        {connected ? (
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("steam.field.identityStatus")}</dt>
              <dd className="font-medium text-foreground">
                {t(`identity.status.${view?.identityStatus ?? "unlinked"}` as TranslationKey)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("steam.field.profileVisibility")}</dt>
              <dd className="font-medium text-foreground">
                {view?.profilePublic === null || view?.profilePublic === undefined
                  ? DASH
                  : t(view.profilePublic ? "steam.visibility.public" : "steam.visibility.private")}
              </dd>
            </div>
          </dl>
        ) : null}

        {/* Honest capability note: identity, not match data. */}
        <p className="text-xs text-muted-foreground">{t("steam.note.identityOnly")}</p>

        {!configured ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("steam.unavailable")}
          </p>
        ) : null}

        {callback?.status === "success" ? (
          <p className="text-xs text-success">{t("steam.linked")}</p>
        ) : null}

        {activeReason ? (
          <p role="alert" className="text-xs text-destructive">
            {t(`steam.reason.${activeReason}` as TranslationKey)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {configured && !connected ? (
            <Button size="sm" onClick={() => link.mutate()} disabled={busy}>
              {link.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              {t("steam.action.link")}
            </Button>
          ) : null}

          {connected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevealed((value) => !value)}
                disabled={busy}
              >
                {revealed ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
                {t(revealed ? "steam.action.hideId" : "steam.action.revealId")}
              </Button>
              {view?.profileUrl ? (
                <a
                  href={view.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  {t("steam.action.openProfile")}
                </a>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unlink.mutate()}
                disabled={busy}
                className="text-destructive"
              >
                {unlink.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Link2Off className="size-4" aria-hidden />
                )}
                {t("steam.action.unlink")}
              </Button>
            </>
          ) : null}
        </div>

        {connected ? (
          <p className="text-xs text-muted-foreground">{t("steam.note.unlinkKeepsHistory")}</p>
        ) : null}
      </div>
    </ChartCard>
  );
}

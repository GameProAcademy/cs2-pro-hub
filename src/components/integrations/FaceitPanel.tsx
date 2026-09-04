/**
 * FASE 2.2.1 — FACEIT connection card.
 *
 * Honest UI: the button only exists when the integration is actually configured,
 * every state (disconnected / connecting / connected / syncing / error /
 * duplicate account) has its own message, and no fake number is ever rendered —
 * missing FACEIT data is shown as "—", never as zero.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Link2, Link2Off, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { FaceitErrorCode } from "@/lib/faceit/faceit.errors";
import {
  disconnectFaceitConnection,
  getFaceitConnection,
  requestFaceitSync,
  type FaceitConnectionView,
} from "@/lib/faceit.functions";

/** Error code -> translation reason, mirroring the server-side callback reasons. */
function reasonFor(code: FaceitErrorCode | undefined): string {
  switch (code) {
    case "FACEIT_DUPLICATE_ACCOUNT":
      return "duplicate_account";
    case "FACEIT_CONFIGURATION_MISSING":
      return "configuration_missing";
    case "FACEIT_RATE_LIMITED":
      return "rate_limited";
    case "FACEIT_NOT_CONNECTED":
      return "not_connected";
    case "FACEIT_SYNC_IN_PROGRESS":
      return "sync_in_progress";
    case "FACEIT_TEMPORARY_ERROR":
    case "FACEIT_TIMEOUT":
    case "FACEIT_NETWORK_ERROR":
      return "temporary";
    case "FACEIT_PLAYER_NOT_FOUND":
      return "player_not_found";
    case "FACEIT_OAUTH_ACCESS_DENIED":
      return "access_denied";
    default:
      return "error";
  }
}

const DASH = "—";

function num(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : DASH;
}

export interface FaceitPanelProps {
  /** Result of the OAuth callback redirect, when the user just came back. */
  callback?: { status: "success" | "error"; reason?: string } | undefined;
}

export function FaceitPanel({ callback }: FaceitPanelProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [localReason, setLocalReason] = useState<string | null>(null);

  const connection = useQuery<FaceitConnectionView>({
    queryKey: ["faceit", "connection"],
    queryFn: () => getFaceitConnection(),
    // While a synchronisation is running the card refreshes on its own.
    refetchInterval: (query) =>
      query.state.data?.state === "syncing" || callback?.status === "success" ? 5000 : false,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const { startFaceitConnection } = await import("@/lib/faceit.functions");
      return startFaceitConnection();
    },
    onSuccess: (result) => {
      if (result.ok && result.authorizeUrl) {
        setLocalReason(null);
        window.location.href = result.authorizeUrl;
        return;
      }
      setLocalReason(reasonFor(result.errorCode));
    },
    onError: () => setLocalReason("error"),
  });

  const syncMutation = useMutation({
    mutationFn: () => requestFaceitSync(),
    onSuccess: (result) => {
      setLocalReason(result.ok ? null : reasonFor(result.errorCode));
      void queryClient.invalidateQueries({ queryKey: ["faceit", "connection"] });
    },
    onError: () => setLocalReason("error"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectFaceitConnection(),
    onSuccess: () => {
      setLocalReason(null);
      void queryClient.invalidateQueries({ queryKey: ["faceit", "connection"] });
    },
    onError: () => setLocalReason("error"),
  });

  const data = connection.data;
  const state = data?.state ?? "disconnected";
  const busy = startMutation.isPending || syncMutation.isPending || disconnectMutation.isPending;
  const reason = localReason ?? (callback?.status === "error" ? (callback.reason ?? "error") : null);

  return (
    <ChartCard title={t("faceit.title")} subtitle={t("faceit.subtitle")}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{t("faceit.notice")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t(`faceit.state.${state}`)}
          </span>
          {data?.nickname ? (
            <span className="text-sm font-medium text-foreground">{data.nickname}</span>
          ) : null}
          {data?.profileUrl ? (
            <a
              href={data.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t("faceit.openProfile")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>

        {callback?.status === "success" ? (
          <p className="text-sm text-foreground">{t("faceit.success")}</p>
        ) : null}

        {reason ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t(`faceit.reason.${reason}` as Parameters<typeof t>[0])}
          </p>
        ) : null}

        {data && !data.oauthReady ? (
          <p className="text-sm text-muted-foreground">{t("faceit.configHint")}</p>
        ) : null}
        {data?.oauthReady && !data.dataApiReady ? (
          <p className="text-sm text-muted-foreground">{t("faceit.dataApiMissing")}</p>
        ) : null}

        {data?.connected ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={t("faceit.level")} value={num(data.skillLevel)} />
            <Field label={t("faceit.elo")} value={num(data.faceitElo)} />
            <Field label={t("faceit.region")} value={data.region ?? DASH} />
            <Field label={t("faceit.country")} value={data.country ?? DASH} />
            <Field label={t("faceit.matches")} value={String(data.syncedMatches)} />
            <Field
              label={t("faceit.lastSync")}
              value={
                data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : t("faceit.never")
              }
            />
          </dl>
        ) : null}

        {data?.currentJob ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-mono uppercase tracking-[0.16em]">
              {t("faceit.jobStatus")}: {data.currentJob.status}
            </p>
            <p className="mt-1">
              {t("faceit.matchesFound")}: {num(data.currentJob.matchesFound)} ·{" "}
              {t("faceit.matchesNew")}: {num(data.currentJob.matchesNew)} ·{" "}
              {t("faceit.matchesUpdated")}: {num(data.currentJob.matchesUpdated)}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!data?.connected ? (
            <Button
              onClick={() => startMutation.mutate()}
              disabled={busy || !data?.oauthReady || connection.isLoading}
            >
              {startMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              {t("faceit.connect")}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={busy || state === "syncing" || !data.dataApiReady}
              >
                {syncMutation.isPending || state === "syncing" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                {state === "syncing" ? t("faceit.syncing") : t("faceit.sync")}
              </Button>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={busy}
              >
                <Link2Off className="size-4" aria-hidden />
                {t("faceit.disconnect")}
              </Button>
            </>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{t("faceit.limits")}</p>
      </div>
    </ChartCard>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

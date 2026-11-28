/**
 * VGL 5.1 — Frente 2: the Match Room of an imported FACEIT match. Same frame as a demo room
 * (header, map identity), but only what FACEIT reported: source, teams and score, the player's
 * own numbers. Rounds, duels, deaths, utility, event map and replay need the demo's events and
 * are stated as unavailable — never simulated.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Upload } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/States";
import { GameIcon } from "@/components/common/GameIcon";
import { MatchSourceTag } from "@/components/real/RealData";
import { Button } from "@/components/ui/button";
import { useI18n, type TranslationKey } from "@/i18n";
import { fill, formatDate, formatNumber, NOT_AVAILABLE_MARK } from "@/lib/format";
import { getFaceitMatchRoom, type FaceitMatchRoomView } from "@/lib/faceitMatches.functions";

export function FaceitMatchRoom({ matchId }: { matchId: string }) {
  const { t, intlTag } = useI18n();
  const q = useQuery<FaceitMatchRoomView>({
    queryKey: ["faceit", "room", matchId],
    queryFn: () => getFaceitMatchRoom({ data: { matchId } }),
  });
  if (q.isPending) return <LoadingState label={t("vgl51.faceit.room.loading")} />;
  if (q.isError || !q.data || q.data.state !== "OK")
    return (
      <ErrorState
        title={t("real.error.title")}
        description={t("vgl51.faceit.room.error")}
        onRetry={() => void q.refetch()}
      />
    );
  const r = q.data;
  const s = r.stats;
  const kd = s && s.kills !== null && s.deaths !== null && s.deaths > 0 ? s.kills / s.deaths : null;
  const notReported = (
    <span className="text-sm font-normal italic text-muted-foreground">
      {t("vgl51.faceit.room.notReported")}
    </span>
  );
  const cells: Array<[TranslationKey, number | null, number, string?]> = [
    ["vgl51.faceit.metric.kills", s?.kills ?? null, 0],
    ["vgl51.faceit.metric.deaths", s?.deaths ?? null, 0],
    ["vgl51.faceit.metric.assists", s?.assists ?? null, 0],
    ["vgl5.pub.metric.kd", kd, 2],
    ["vgl5.pub.metric.adr", s?.adr ?? null, 0],
    ["vgl5.pub.metric.hsPercent", s?.hsPercent ?? null, 0, "%"],
    ["vgl5.pub.metric.kast", s?.kast ?? null, 0, "%"],
    ["vgl51.faceit.metric.rounds", r.rounds, 0],
  ];
  return (
    <div className="space-y-5" data-faceit-room data-source="faceit">
      <section
        className="surface-panel vgl-grid rounded-xl border border-border p-4 sm:p-5"
        aria-labelledby="faceit-room-source"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="faceit-room-source"
            className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            <GameIcon name="crosshair" className="size-4 text-primary" />
            {t("vgl51.faceit.room.sourceTitle")}
          </h2>
          <MatchSourceTag source="faceit" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("vgl51.faceit.room.sourceBody")}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t("vgl51.faceit.room.competition")}</dt>
            <dd>{r.competition ?? NOT_AVAILABLE_MARK}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("vgl51.faceit.room.region")}</dt>
            <dd>{r.region ?? NOT_AVAILABLE_MARK}</dd>
          </div>
          <div>
            <dt className="sr-only">{t("vgl51.faceit.room.synced")}</dt>
            <dd className="text-xs text-muted-foreground">
              {r.syncedAt
                ? fill(t("vgl51.faceit.room.synced"), { date: formatDate(r.syncedAt, intlTag) })
                : NOT_AVAILABLE_MARK}
            </dd>
          </div>
        </dl>
        {r.faceitUrl ? (
          <a
            href={r.faceitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            data-faceit-room-link
          >
            {t("vgl51.faceit.room.open")}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </section>

      <section
        className="surface-panel rounded-xl border border-border p-4 sm:p-5"
        aria-labelledby="faceit-room-teams"
      >
        <h2
          id="faceit-room-teams"
          className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          {t("vgl51.faceit.room.teams")}
        </h2>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <p className="truncate font-display text-lg font-semibold uppercase">
            {r.teamPlayer ?? NOT_AVAILABLE_MARK}
          </p>
          <p className="font-display text-3xl font-semibold tabular-nums" data-faceit-score>
            {r.scorePlayer ?? NOT_AVAILABLE_MARK}
            <span className="mx-2 text-muted-foreground">–</span>
            {r.scoreOpponent ?? NOT_AVAILABLE_MARK}
          </p>
          <p className="truncate font-display text-lg font-semibold uppercase text-muted-foreground">
            {r.teamOpponent ?? NOT_AVAILABLE_MARK}
          </p>
        </div>
      </section>

      <section
        className="surface-panel rounded-xl border border-border p-4 sm:p-5"
        aria-labelledby="faceit-room-stats"
      >
        <h2
          id="faceit-room-stats"
          className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          {t("vgl51.faceit.room.stats")}
        </h2>
        {s ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-faceit-room-stats>
            {cells.map(([k, v, digits, unit]) => (
              <div key={k} className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{t(k)}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {v === null ? notReported : `${formatNumber(v, intlTag, digits)}${unit ?? ""}`}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground" data-faceit-room-pending>
            {t("vgl51.faceit.room.pending")}
          </p>
        )}
      </section>

      <section
        className="rounded-xl border border-dashed border-border p-4 sm:p-5"
        aria-labelledby="faceit-room-unavailable"
        data-faceit-room-unavailable
      >
        <h2 id="faceit-room-unavailable" className="text-sm font-semibold text-foreground">
          {t("vgl51.faceit.room.unavailableTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("vgl51.faceit.room.unavailableBody")}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to="/upload">
            <Upload className="size-4" aria-hidden />
            {t("vgl51.faceit.room.upload")}
          </Link>
        </Button>
      </section>
    </div>
  );
}

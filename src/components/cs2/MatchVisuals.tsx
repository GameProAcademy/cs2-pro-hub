/**
 * Visual Game Language 2.0 — matches as CS2 scenes: the map's in-game art behind the match, the
 * official emblem, the result, and a HUD strip of the player's real events in that match.
 * Every number is the overview's own value; a missing value is "—" (never 0).
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { MetricTerm } from "@/components/common/MetricTerm";
import { ToneBadge, type BadgeTone } from "@/components/common/VisualBadges";
import { Cs2Mask, MapArt, MapEmblem } from "@/components/cs2/Cs2Art";
import { AdrPartialMark } from "@/components/real/AdrPartialMark";
import { useI18n, type TranslationKey } from "@/i18n";
import { HUD } from "@/lib/cs2/assets";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, formatDate, formatNumber } from "@/lib/format";
import type { OverviewMatch } from "@/lib/playerOverview";
import { cn } from "@/lib/utils";

const RESULT_TONE: Record<"win" | "loss" | "draw", BadgeTone> = {
  win: "brand",
  loss: "critical",
  draw: "context",
};

function ResultBadge({ m }: { m: OverviewMatch }) {
  const { t } = useI18n();
  if (!m.result) return null;
  return (
    <ToneBadge tone={RESULT_TONE[m.result]} data-result={m.result}>
      {t(`matches.result.${m.result}` as TranslationKey)}
    </ToneBadge>
  );
}

function Score({
  m,
  className,
  showUnknown = false,
}: {
  m: OverviewMatch;
  className?: string;
  showUnknown?: boolean;
}) {
  const { t } = useI18n();
  if (m.scorePlayer === null || m.scoreOpponent === null)
    return showUnknown ? (
      <span
        className={cn("font-mono tabular-nums text-muted-foreground", className)}
        title={t("vgl3.score.unknown")}
        aria-label={t("vgl3.score.unknown")}
        data-score="unknown"
      >
        {`${NOT_AVAILABLE_MARK} : ${NOT_AVAILABLE_MARK}`}
      </span>
    ) : null;
  return (
    <span className={cn("font-mono font-semibold tabular-nums", className)} data-score>
      <span className={m.result === "win" ? "text-primary" : "text-foreground"}>
        {m.scorePlayer}
      </span>
      <span className="mx-1 text-muted-foreground">:</span>
      <span className="text-foreground">{m.scoreOpponent}</span>
    </span>
  );
}

/** One HUD cell: game icon, value, label. A null value is the em dash, in neutral. */
export function HudStat({
  icon,
  value,
  label,
  extra,
}: {
  icon: ReactNode;
  value: string | null;
  label: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-hud-stat>
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          value === null
            ? "border-dashed border-border-strong text-muted-foreground"
            : "border-primary/25 bg-primary/10 text-primary",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-lg font-semibold leading-tight tabular-nums text-foreground">
          {value ?? <span className="text-muted-foreground">{NOT_AVAILABLE_MARK}</span>}
          {extra}
        </p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

const icon = (src: string) => <Cs2Mask src={src} className="size-5" />;

/** Partidas: a match as a card over its map art (opens the Match Room). */
export function MatchCard({ m, index = 0 }: { m: OverviewMatch; index?: number }) {
  const { t, intlTag } = useI18n();
  const n = (v: number | null, d = 0) =>
    v === null ? NOT_AVAILABLE_MARK : formatNumber(v, intlTag, d);
  return (
    <li className="vgl-rise" style={{ "--vgl-i": index } as CSSProperties}>
      <Link
        to="/matches/$matchId"
        params={{ matchId: m.matchId }}
        className="vgl-lift block overflow-hidden rounded-xl border border-border hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-match-card={m.matchId}
      >
        <MapArt map={m.map} overlay="soft" className="h-28 px-4 pt-3">
          <div className="flex items-start justify-between gap-2">
            <MapEmblem map={m.map} className="size-12" />
            <ResultBadge m={m} />
          </div>
        </MapArt>
        <div className="space-y-3 bg-card px-4 pb-4 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-display text-lg font-semibold uppercase tracking-wide text-foreground">
              {m.map ? mapDisplayName(m.map) : NOT_AVAILABLE_MARK}
            </p>
            <Score m={m} className="text-lg" showUnknown />
          </div>
          <p className="text-xs text-muted-foreground">
            <time dateTime={m.playedAt}>{formatDate(m.playedAt, intlTag)}</time>
          </p>
          <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">K / D</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {n(m.kills)} / {n(m.deaths)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                <MetricTerm id="adr" />
              </dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {n(m.adr, 1)}
                {m.adr !== null && m.adrPartial ? <AdrPartialMark /> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                <MetricTerm id="kast" />
              </dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {m.kast === null ? NOT_AVAILABLE_MARK : `${n(m.kast, 0)}%`}
              </dd>
            </div>
          </dl>
        </div>
      </Link>
    </li>
  );
}

export function MatchCardGrid({ rows, limit = 6 }: { rows: OverviewMatch[]; limit?: number }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <section aria-label={t("vgl.matches.recent")} data-match-cards>
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <GameIcon name="rounds" className="size-4 text-primary" />
        {t("vgl.matches.recent")}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.slice(0, limit).map((m, i) => (
          <MatchCard key={m.matchId} m={m} index={i} />
        ))}
      </ul>
    </section>
  );
}

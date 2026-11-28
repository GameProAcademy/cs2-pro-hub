/**
 * VGL 5.0 — Melhor Mapa. ONE ranking (`map-rank-v1`) computed once per overview and shared by the
 * Dashboard hero, the Maps identity panel and the map gallery labels, so every screen shows the
 * same best map. Values come from the overview already loaded on the page (no extra query).
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight, Trophy } from "lucide-react";
import { useMemo } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { MetricTerm } from "@/components/common/MetricTerm";
import { ToneBadge, type BadgeTone } from "@/components/common/VisualBadges";
import { MapArt, MapEmblem } from "@/components/cs2/Cs2Art";
import { HudStat } from "@/components/cs2/MatchVisuals";
import { usePlayerOverview } from "@/components/real/RealData";
import { useI18n, type TranslationKey } from "@/i18n";
import { mapDisplayName, normalizeMapCode } from "@/lib/cs2/maps";
import { fill, formatNumber } from "@/lib/format";
import {
  MAP_RANK_MIN_MATCHES,
  MAP_RANK_VERSION,
  rankMaps,
  type MapRank,
  type MapRanking,
  type MapTier,
} from "@/lib/maps/mapRanking";
import type { OverviewMatch } from "@/lib/playerOverview";
import { normalizeMapName } from "@/lib/spatial/maps";
import { cn } from "@/lib/utils";

/** The ranking of the player's matches (memoised on the overview's match list). */
export function useMapRanking(matches: ReadonlyArray<OverviewMatch> | null | undefined) {
  return useMemo(() => (matches ? rankMaps(matches) : null), [matches]);
}

/** The ranking from the page's cached overview (READY only). */
export function useOverviewMapRanking(): MapRanking | null {
  const q = usePlayerOverview();
  const matches = q.data && q.data.state === "READY" ? q.data.matches : null;
  return useMapRanking(matches);
}

const TIER_TONE: Record<MapTier, BadgeTone> = {
  BEST: "brand",
  SECOND: "brand",
  THIRD: "brand",
  MEDIAN: "context",
  DEVELOP: "attention",
  PROVISIONAL: "neutral",
  NO_DATA: "neutral",
};

/** Compact, readable tier label for map cards. */
export function MapTierBadge({ rank, className }: { rank: MapRank; className?: string }) {
  const { t } = useI18n();
  return (
    <ToneBadge
      tone={TIER_TONE[rank.tier]}
      className={className}
      data-map-tier={rank.tier}
      aria-label={fill(t("bestMap.rankBadge"), {
        tier: t(`bestMap.tier.${rank.tier}` as TranslationKey),
      })}
    >
      {rank.tier === "BEST" ? <Trophy className="mr-1 size-3" aria-hidden /> : null}
      {t(`bestMap.short.${rank.tier}` as TranslationKey)}
    </ToneBadge>
  );
}

function signed(v: number, intlTag: string): string {
  const pct = formatNumber(v * 100, intlTag, 0);
  return v > 0 ? `+${pct}` : pct;
}

/** The facts of one ranked map, shared by the Dashboard hero and the Maps panel. */
export function BestMapFacts({ rank }: { rank: MapRank }) {
  const { t, intlTag } = useI18n();
  const n = (v: number | null, d = 0) => (v === null ? null : formatNumber(v, intlTag, d));
  return (
    <div
      className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border/60 pt-5 sm:grid-cols-3 xl:grid-cols-6"
      data-best-map-facts
    >
      <HudStat
        icon={<GameIcon name="rounds" className="size-5" />}
        value={String(rank.matches)}
        label={t("vgl4.map.matches")}
      />
      <HudStat
        icon={<GameIcon name="crosshair" className="size-5" />}
        value={n(rank.rating, 2)}
        label={<MetricTerm id="rating" />}
      />
      <HudStat
        icon={<GameIcon name="kill" className="size-5" />}
        value={n(rank.adr, 1)}
        label={<MetricTerm id="adr" />}
      />
      <HudStat
        icon={<GameIcon name="trade" className="size-5" />}
        value={rank.kast === null ? null : `${n(rank.kast, 0)}%`}
        label={<MetricTerm id="kast" />}
      />
      <HudStat
        icon={<GameIcon name="opening" className="size-5" />}
        value={n(rank.kd, 2)}
        label={<MetricTerm id="kd" />}
      />
      <HudStat
        icon={<Trophy className="size-5" aria-hidden />}
        value={rank.winRate === null ? null : `${n(rank.winRate * 100, 0)}%`}
        label={<MetricTerm id="winRate" />}
      />
    </div>
  );
}

/** Performance vs own average + confidence, in words. */
export function BestMapVerdict({ rank, className }: { rank: MapRank; className?: string }) {
  const { t, intlTag } = useI18n();
  return (
    <p
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}
      data-best-map-verdict
    >
      {rank.estimate !== null ? (
        <span
          className={cn(
            "font-mono font-semibold tabular-nums",
            rank.estimate >= 0 ? "text-primary" : "text-muted-foreground",
          )}
          title={t("bestMap.vsAverage")}
        >
          {fill(t("bestMap.vsAverageValue"), { v: signed(rank.estimate, intlTag) })}
        </span>
      ) : null}
      {rank.confidence ? (
        <span className="text-muted-foreground">
          {t("bestMap.confidence.label")}:{" "}
          {t(`bestMap.confidence.${rank.confidence}` as TranslationKey)}
        </span>
      ) : null}
    </p>
  );
}

/** Início: the hero card (the former "Última partida" scene) now shows the player's best map. */
export function BestMapHero({ matches }: { matches: ReadonlyArray<OverviewMatch> }) {
  const { t } = useI18n();
  const ranking = useMapRanking(matches);
  const best = ranking?.best ?? null;
  // The heatmap filter takes the map as stored on the matches (e.g. "de_mirage").
  const rawMap = best
    ? (matches
        .map((m) => normalizeMapName(m.map))
        .find((raw) => normalizeMapCode(raw) === best.map) ?? null)
    : null;
  return (
    <section
      className="vgl-rise overflow-hidden rounded-xl border border-border shadow-[var(--shadow-elevated)]"
      aria-label={t("bestMap.eyebrow")}
      data-best-map-hero={best?.map ?? "none"}
    >
      <MapArt map={rawMap} className="px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-center gap-4">
          <MapEmblem map={rawMap} className="size-16 sm:size-20" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {t("bestMap.eyebrow")}
            </p>
            <h2 className="break-words font-display text-2xl font-semibold uppercase tracking-wide text-foreground sm:text-3xl">
              {best ? mapDisplayName(best.map) : t("bestMap.empty.title")}
            </h2>
            {best ? (
              <BestMapVerdict rank={best} className="mt-1" />
            ) : (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {fill(t("bestMap.empty.description"), { min: MAP_RANK_MIN_MATCHES })}
              </p>
            )}
          </div>
          <Link
            to="/maps"
            search={rawMap ? { map: rawMap } : {}}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:w-auto"
            data-hero-cta
          >
            {t("bestMap.open")}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        {best ? <BestMapFacts rank={best} /> : null}
        <p className="mt-4 text-xs text-muted-foreground" data-best-map-method>
          {fill(t("bestMap.method"), { version: MAP_RANK_VERSION })}
        </p>
      </MapArt>
    </section>
  );
}

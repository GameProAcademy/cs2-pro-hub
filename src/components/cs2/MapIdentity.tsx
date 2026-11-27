/**
 * VGL 4.0 — Map Experience: the identity panel of the selected map. Art, emblem, name, radar
 * support, the number of the player's matches on it, first and last date, the official radar and
 * the list of those matches with their own values (result, K/D, ADR) linking to the match room.
 * No per-map average is computed: each row is one match's own numbers.
 */
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { ToneBadge } from "@/components/common/VisualBadges";
import { MapArt, MapEmblem } from "@/components/cs2/Cs2Art";
import { usePlayerOverview } from "@/components/real/RealData";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import type { OverviewMatch } from "@/lib/playerOverview";
import type { MapSupport } from "@/lib/spatial/maps";
import { normalizeMapName } from "@/lib/spatial/maps";
import { radarAsset } from "@/lib/spatial/radarAssets";
import { cn } from "@/lib/utils";

/** The player's matches on one map, newest first, and the date span. Pure. */
export function matchesOnMap(matches: ReadonlyArray<OverviewMatch>, map: string) {
  const on = matches
    .filter((m) => normalizeMapName(m.map) === map)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  return {
    list: on,
    first: on.length ? on[on.length - 1]!.playedAt : null,
    last: on.length ? on[0]!.playedAt : null,
  };
}

export function MapIdentityPanel({ map, support }: { map: string; support: MapSupport["status"] }) {
  const t = useT();
  const { intlTag } = useI18n();
  const q = usePlayerOverview();
  const matches = q.data && q.data.state === "READY" ? q.data.matches : null;
  const on = matches ? matchesOnMap(matches, map) : null;
  const radar = support === "SUPPORTED" ? radarAsset(map, "default") : null;
  return (
    <MapArt map={map} className="vgl-rise rounded-2xl border border-border">
      <section
        key={map}
        className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
        aria-labelledby="map-identity-title"
        data-map-identity={map}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <MapEmblem map={map} className="size-16 sm:size-20" />
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
                {t("vgl4.map.eyebrow")}
              </p>
              <h2
                id="map-identity-title"
                className="font-display text-3xl font-semibold uppercase tracking-wide text-foreground sm:text-4xl"
              >
                {mapDisplayName(map)}
              </h2>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" data-map-identity-facts>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <dt className="text-xs text-muted-foreground">{t("vgl4.map.matches")}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
                {on ? on.list.length : NOT_AVAILABLE_MARK}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <dt className="text-xs text-muted-foreground">{t("vgl4.map.span")}</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums text-foreground">
                {on?.first && on.last
                  ? `${formatDate(on.first, intlTag)} → ${formatDate(on.last, intlTag)}`
                  : NOT_AVAILABLE_MARK}
              </dd>
            </div>
            <div className="col-span-2 rounded-lg border border-border bg-background/60 p-3 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">{t("vgl4.map.radar")}</dt>
              <dd className="mt-1 text-sm text-foreground" data-map-support={support}>
                {t(support === "SUPPORTED" ? "vgl4.map.radarYes" : "vgl4.map.radarNo")}
              </dd>
            </div>
          </dl>
          {on && on.list.length ? (
            <div className="mt-5">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t("vgl4.map.list")}
              </h3>
              <ol className="space-y-1.5" data-map-match-list>
                {on.list.map((m, i) => (
                  <li
                    key={m.matchId}
                    className="vgl-rise"
                    style={{ "--vgl-i": i } as CSSProperties}
                    data-map-match={m.matchId}
                  >
                    <Link
                      to="/matches/$matchId"
                      params={{ matchId: m.matchId }}
                      className="vgl-lift grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    >
                      <span className="font-mono tabular-nums text-foreground">
                        {formatDate(m.playedAt, intlTag)}
                      </span>
                      <span>
                        {m.result ? (
                          <ToneBadge
                            tone={
                              m.result === "win"
                                ? "brand"
                                : m.result === "loss"
                                  ? "critical"
                                  : "neutral"
                            }
                          >
                            {t(`matches.result.${m.result}` as TranslationKey)}
                          </ToneBadge>
                        ) : (
                          <span className="text-muted-foreground">{NOT_AVAILABLE_MARK}</span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-foreground">
                        {m.kills === null || m.deaths === null
                          ? NOT_AVAILABLE_MARK
                          : `${m.kills} / ${m.deaths}`}
                      </span>
                      <span className="hidden font-mono tabular-nums text-muted-foreground sm:inline">
                        {m.adr === null
                          ? NOT_AVAILABLE_MARK
                          : fill(t("vgl4.map.adr"), { v: formatNumber(m.adr, intlTag, 1) })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
        <div className="hidden lg:block">
          {radar ? (
            <img
              src={radar.src}
              alt={fill(t("vgl4.map.radarAlt"), { map: mapDisplayName(map) })}
              className="aspect-square w-full rounded-xl border border-border bg-background/60 object-contain p-2"
              loading="lazy"
              data-map-identity-radar
            />
          ) : (
            <div
              className={cn(
                "flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border-strong p-4 text-center text-sm text-muted-foreground",
              )}
            >
              <span>
                <GameIcon name="map" className="mx-auto mb-2 size-6" />
                {t("vgl4.map.radarNo")}
              </span>
            </div>
          )}
        </div>
      </section>
    </MapArt>
  );
}

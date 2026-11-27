/**
 * VGL 4.0 — Match Experience 2.0: the match overview (summary tab) and the tab intro band.
 * Every number is a field of `OverviewMatch` already shown elsewhere in the app; null stays "—".
 */
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { HudIcon, SideLogo, WeaponArt } from "@/components/cs2/Cs2Art";
import { HudStat } from "@/components/cs2/MatchVisuals";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { NOT_AVAILABLE_MARK, formatNumber } from "@/lib/format";
import type { OverviewMatch } from "@/lib/playerOverview";
import { cn } from "@/lib/utils";

export const ROOM_DETAIL_TABS = ["rounds", "duels", "deaths", "utility", "map", "replay"] as const;
export type RoomDetailTab = (typeof ROOM_DETAIL_TABS)[number];

export const ROOM_TAB_ICON: Record<RoomDetailTab | "summary", GameIconName> = {
  summary: "crosshair",
  rounds: "rounds",
  duels: "trade",
  deaths: "kill",
  utility: "flash",
  map: "map",
  replay: "rounds",
};

const str = (v: number | null) => (v === null ? null : String(v));

export function MatchOverview({ m }: { m: OverviewMatch }) {
  const t = useT();
  const { intlTag } = useI18n();
  const rating = (v: number | null) =>
    v === null ? NOT_AVAILABLE_MARK : formatNumber(v, intlTag, 2);
  return (
    <section
      className="surface-panel vgl-grid relative overflow-hidden rounded-xl border border-border p-4 sm:p-5"
      aria-labelledby="match-overview-title"
      data-match-overview
    >
      <h2
        id="match-overview-title"
        className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
      >
        <GameIcon name="crosshair" className="size-4 text-primary" />
        {t("vgl4.overview.title")}
      </h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid grid-cols-3 gap-2" data-overview-line>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-xs text-muted-foreground">{t("vgl4.overview.kda")}</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
              {[m.kills, m.deaths, m.assists]
                .map((v) => (v === null ? NOT_AVAILABLE_MARK : v))
                .join(" / ")}
            </p>
          </div>
          {(
            [
              ["CT", m.ctRating],
              ["T", m.tRating],
            ] as const
          ).map(([side, v]) => (
            <div
              key={side}
              className={cn(
                "rounded-lg border bg-background/50 p-3",
                side === "CT" ? "border-side-ct/40" : "border-side-t/40",
              )}
              data-overview-side={side}
            >
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <SideLogo side={side} className="size-4" />
                {t(side === "CT" ? "vgl4.overview.ratingCt" : "vgl4.overview.ratingT")}
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {rating(v)}
              </p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-overview-events>
          <HudStat
            icon={<GameIcon name="opening" className="size-5" />}
            value={str(m.firstKills)}
            label={t("vgl4.overview.openings")}
          />
          <HudStat
            icon={<HudIcon name="icon_skull_default" className="size-5" />}
            value={str(m.firstDeaths)}
            label={t("vgl4.overview.openingDeaths")}
          />
          <HudStat
            icon={<GameIcon name="trade" className="size-5" />}
            value={str(m.tradeKills)}
            label={t("vgl4.overview.trades")}
          />
          <HudStat
            icon={<WeaponArt weapon="flashbang" className="h-5 w-6" />}
            value={str(m.flashAssists)}
            label={t("vgl4.overview.flash")}
          />
        </div>
      </div>
      <nav aria-label={t("vgl4.overview.go")} className="mt-5">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {ROOM_DETAIL_TABS.map((tab, i) => (
            <li
              key={tab}
              className="vgl-rise"
              style={{ "--vgl-i": i } as CSSProperties}
              data-overview-link={tab}
            >
              <Link
                to="/matches/$matchId"
                params={{ matchId: m.matchId }}
                search={{ tab }}
                className="vgl-lift flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GameIcon
                  name={ROOM_TAB_ICON[tab]}
                  className={cn(
                    "size-4",
                    tab === "utility" ? "text-category-utility" : "text-primary",
                  )}
                />
                {t(`room.tab.${tab}` as TranslationKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

/** A short band at the top of each detail tab: what this tab reads. */
export function TabIntro({ tab }: { tab: RoomDetailTab }) {
  const t = useT();
  return (
    <div
      className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-card/60 px-4 py-3"
      data-tab-intro={tab}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          tab === "utility"
            ? "border-category-utility/40 bg-category-utility/10 text-category-utility"
            : "border-primary/30 bg-primary/10 text-primary",
        )}
      >
        <GameIcon name={ROOM_TAB_ICON[tab]} className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
          {t(`room.tab.${tab}` as TranslationKey)}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`vgl4.tabIntro.${tab}` as TranslationKey)}
        </p>
      </div>
    </div>
  );
}

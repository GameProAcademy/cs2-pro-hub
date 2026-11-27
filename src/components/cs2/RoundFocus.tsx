/**
 * VGL 4.0 — Match Experience 2.0: the round in focus.
 *
 * One selected round shows, from data the server already returns:
 * - header: number, side, result, overtime;
 * - economy: your team's buy × the opponent's (the same labels as the round list; the bars are the
 *   buy category's order, never money);
 * - fact cards from `RoundReport.me`, opening, clutch and bomb;
 * - the round's own kill feed;
 * - a tactical radar with your kills and deaths in that round, placed where the parser recorded them
 *   (`getSpatialHeatmap` for this match, filtered by round). Nothing is interpolated: no route, no
 *   position for an event without coordinates, no point outside the official radar.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { SideBadge, ToneBadge } from "@/components/common/VisualBadges";
import { HudIcon, SideLogo, WeaponArt } from "@/components/cs2/Cs2Art";
import { KillFeedLine, RoundJump } from "@/components/cs2/MatchTimeline";
import { spatialQueryKey } from "@/components/real/RealHeatmap";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { weaponArt } from "@/lib/cs2/assets";
import { NOT_AVAILABLE_MARK, fill, formatNumber } from "@/lib/format";
import type { BuyCategory, BuyLabel } from "@/lib/rounds/economy";
import type { RoundReport, TimelineItem } from "@/lib/rounds/roundImpact";
import { getSpatialHeatmap } from "@/lib/spatial.functions";
import type { HeatmapPoint } from "@/lib/spatial/heatmap";
import { RADAR_SIZE } from "@/lib/spatial/maps";
import { radarAsset } from "@/lib/spatial/radarAssets";
import { cn } from "@/lib/utils";

type Side = "CT" | "T";

/** Order of buy categories for the duel bars (a scale of the label, not money). */
const BUY_LEVEL: Record<BuyCategory, number> = {
  pistol: 1,
  eco: 1,
  low_buy: 2,
  hero_low_buy: 2,
  half_buy: 3,
  hero_half_buy: 3,
  full_buy: 4,
};

export function buyLevel(label: BuyLabel | undefined): number | null {
  return label?.status === "CLASSIFIED" ? BUY_LEVEL[label.category] : null;
}

function buyName(t: ReturnType<typeof useT>, label: BuyLabel | undefined) {
  if (!label) return NOT_AVAILABLE_MARK;
  if (label.status === "UNKNOWN") return t(`rounds.unknown.${label.reason}` as TranslationKey);
  return t(`rounds.buy.${label.category}` as TranslationKey) + (label.scaled ? " *" : "");
}

/** Your buy × the opponent's, as two labelled bars of four steps. */
export function EconomyDuel({ round }: { round: RoundReport }) {
  const t = useT();
  const side = round.side;
  if (!side) return null;
  const enemySide: Side = side === "CT" ? "T" : "CT";
  const rows: [string, Side, BuyLabel | undefined][] = [
    [t("vgl4.round.yourBuy"), side, round.economy.teams[side]?.label],
    [t("vgl4.round.enemyBuy"), enemySide, round.economy.teams[enemySide]?.label],
  ];
  return (
    <div className="space-y-2" data-economy-duel>
      {rows.map(([who, s, label]) => {
        const level = buyLevel(label);
        return (
          <div key={who} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-xs leading-tight text-muted-foreground">
              <SideBadge side={s} />
              <span className="min-w-0 break-words">{who}</span>
            </span>
            <span className="min-w-0">
              <span className="flex gap-1" aria-hidden data-buy-level={level ?? "unknown"}>
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={cn(
                      "h-2 flex-1 rounded-sm",
                      level === null
                        ? "border border-dashed border-border"
                        : n <= level
                          ? s === "CT"
                            ? "bg-side-ct"
                            : "bg-side-t"
                          : "bg-muted",
                    )}
                  />
                ))}
              </span>
              <span className="mt-1 block truncate text-xs text-foreground">
                {buyName(t, label)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: "neutral" | "good" | "bad" | "context";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/50 p-3",
        tone === "good"
          ? "border-primary/40"
          : tone === "bad"
            ? "border-destructive/40"
            : tone === "context"
              ? "border-context/40"
              : "border-border",
      )}
      data-round-fact
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function RoundFacts({ round }: { round: RoundReport }) {
  const t = useT();
  const { intlTag } = useI18n();
  const me = round.me;
  const o = round.opening;
  const opening =
    o.status !== "OK"
      ? null
      : o.byMe
        ? { v: t("rounds.tag.openingKill"), tone: "good" as const }
        : o.onMe
          ? { v: t("rounds.tag.openingDeath"), tone: "bad" as const }
          : {
              v:
                o.teamWon === null
                  ? NOT_AVAILABLE_MARK
                  : t(o.teamWon ? "vgl4.round.openingTeam" : "vgl4.round.openingEnemy"),
              tone: "neutral" as const,
            };
  const pp = round.postPlant;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-round-facts>
      <Fact
        icon={<GameIcon name="kill" className="size-3.5 text-primary" />}
        label={t("vgl4.round.kd")}
        value={me ? `${me.kills} / ${me.deaths}` : NOT_AVAILABLE_MARK}
      />
      <Fact
        icon={<GameIcon name="crosshair" className="size-3.5 text-primary" />}
        label={t("vgl4.round.damage")}
        value={
          me
            ? `${me.damageExcludedHits > 0 ? "≥ " : ""}${formatNumber(me.damage, intlTag, 0)}`
            : NOT_AVAILABLE_MARK
        }
      />
      <Fact
        icon={<GameIcon name="opening" className="size-3.5 text-primary" />}
        label={t("vgl4.round.opening")}
        value={<span className="text-sm">{opening ? opening.v : NOT_AVAILABLE_MARK}</span>}
        tone={opening?.tone ?? "neutral"}
      />
      <Fact
        icon={
          round.clutch ? (
            <GameIcon name="clutch" className="size-3.5 text-context" />
          ) : (
            <HudIcon name="icon_c4_default" className="size-3.5 text-side-t" />
          )
        }
        label={round.clutch ? t("vgl4.round.clutch") : t("vgl4.round.bomb")}
        value={
          <span className="text-sm">
            {round.clutch
              ? `1v${round.clutch.opponents} · ${t(round.clutch.won ? "rounds.won" : "rounds.lost")}`
              : pp
                ? t(
                    pp.defused
                      ? "vgl3.marks.defused"
                      : pp.exploded
                        ? "vgl3.marks.exploded"
                        : "vgl3.marks.planted",
                  )
                : t("vgl4.round.noPlant")}
          </span>
        }
        tone={round.clutch ? "context" : "neutral"}
      />
    </div>
  );
}

/** Your kills (lime) and deaths (red) of one round on the official radar. */
export function RoundRadar({
  matchId,
  map,
  round,
}: {
  matchId: string;
  map: string | null;
  round: number;
}) {
  const t = useT();
  const base = map ? { matchId, map } : null;
  const kills = useQuery({
    queryKey: spatialQueryKey({ ...(base ?? {}), layer: "KILLS" }),
    queryFn: () => getSpatialHeatmap({ data: { ...(base ?? {}), layer: "KILLS" } }),
    enabled: !!base,
  });
  const deaths = useQuery({
    queryKey: spatialQueryKey({ ...(base ?? {}), layer: "DEATHS" }),
    queryFn: () => getSpatialHeatmap({ data: { ...(base ?? {}), layer: "DEATHS" } }),
    enabled: !!base,
  });
  const markers = useMemo(
    () => radarMarkers(round, kills.data?.heatmap?.points, deaths.data?.heatmap?.points),
    [round, kills.data, deaths.data],
  );
  const h = kills.data?.heatmap ?? deaths.data?.heatmap ?? null;
  const asset = map ? radarAsset(map, "default") : null;

  let body: ReactNode;
  if (!map || (h && h.support !== "SUPPORTED") || (!asset && h)) {
    body = <RadarNote>{t("vgl4.radar.unsupported")}</RadarNote>;
  } else if (kills.isPending || deaths.isPending) {
    body = (
      <div
        className="vgl-sweep aspect-square w-full rounded-lg border border-border bg-muted/30"
        aria-busy
      />
    );
  } else if (kills.isError || deaths.isError) {
    body = <RadarNote>{t("vgl4.radar.error")}</RadarNote>;
  } else {
    body = (
      <>
        <svg
          viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
          className="aspect-square w-full rounded-lg border border-border bg-secondary/40"
          role="img"
          aria-label={fill(t("vgl4.radar.aria"), { n: round, count: markers.length })}
          data-round-radar
        >
          {asset ? (
            <image
              href={asset.src}
              x={0}
              y={0}
              width={RADAR_SIZE}
              height={RADAR_SIZE}
              preserveAspectRatio="none"
            />
          ) : null}
          {markers.map((m) => (
            <g
              key={m.id}
              transform={`translate(${m.x} ${m.y})`}
              data-radar-marker={m.kind}
              data-radar-round={m.round}
            >
              <g className="vgl-ping" style={{ "--vgl-i": m.n } as CSSProperties}>
                <circle
                  r={22}
                  className={m.kind === "KILL" ? "fill-primary" : "fill-destructive"}
                  stroke="black"
                  strokeWidth={4}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-black font-mono"
                  fontSize={24}
                  fontWeight={700}
                >
                  {m.n}
                </text>
              </g>
            </g>
          ))}
        </svg>
        {markers.length ? (
          <ol className="mt-3 space-y-1.5" data-radar-list>
            {markers.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-black",
                    m.kind === "KILL" ? "bg-primary" : "bg-destructive",
                  )}
                  aria-hidden
                >
                  {m.n}
                </span>
                <span className="text-foreground">
                  {t(m.kind === "KILL" ? "vgl4.radar.kill" : "vgl4.radar.death")}
                </span>
                {m.weapon && weaponArt(m.weapon) ? (
                  <WeaponArt weapon={m.weapon} className="h-4 w-10 text-muted-foreground" />
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.weapon ?? NOT_AVAILABLE_MARK}
                  </span>
                )}
                {m.headshot ? <HudIcon name="headshot" className="size-4" /> : null}
              </li>
            ))}
          </ol>
        ) : (
          <RadarNote>{t("vgl4.radar.none")}</RadarNote>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("vgl4.radar.method")}</p>
      </>
    );
  }
  return (
    <section aria-label={t("vgl4.radar.title")} data-round-radar-panel>
      <h3 className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <GameIcon name="map" className="size-3.5 text-primary" />
        {t("vgl4.radar.title")}
      </h3>
      {body}
    </section>
  );
}

function RadarNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground"
      data-radar-note
    >
      {children}
    </p>
  );
}

export interface RadarMarker {
  id: string;
  n: number;
  kind: "KILL" | "DEATH";
  round: number;
  x: number;
  y: number;
  tick: number | null;
  weapon: string | null;
  headshot: boolean | null;
}

/** Points of one round, kills and deaths together, numbered in tick order. Pure. */
export function radarMarkers(
  round: number,
  kills: ReadonlyArray<HeatmapPoint> | undefined,
  deaths: ReadonlyArray<HeatmapPoint> | undefined,
): RadarMarker[] {
  const all = [
    ...(kills ?? []).filter((p) => p.round === round).map((p) => ({ p, kind: "KILL" as const })),
    ...(deaths ?? []).filter((p) => p.round === round).map((p) => ({ p, kind: "DEATH" as const })),
  ].sort((a, b) => (a.p.tick ?? Infinity) - (b.p.tick ?? Infinity));
  return all.map(({ p, kind }, i) => ({
    id: `${kind}-${p.id}`,
    n: i + 1,
    kind,
    round: p.round,
    x: p.x,
    y: p.y,
    tick: p.tick,
    weapon: p.weapon,
    headshot: p.headshot,
  }));
}

/** First valid round with a side; the panel's default. Pure. */
export function defaultFocusRound(rounds: ReadonlyArray<RoundReport>): number | null {
  return (rounds.find((r) => r.valid && r.side) ?? rounds[0])?.roundNumber ?? null;
}

export function RoundFocus({
  rounds,
  matchId,
  map,
  describe,
}: {
  rounds: RoundReport[];
  matchId: string;
  map: string | null;
  /** The round list's own sentence for an event (kept identical for screen readers). */
  describe: (e: TimelineItem, side: Side | null) => string;
}) {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(() => defaultFocusRound(rounds));
  const round = rounds.find((r) => r.roundNumber === selected) ?? null;
  return (
    <section
      className="surface-panel vgl-grid relative overflow-hidden rounded-xl border border-border p-4 sm:p-5"
      aria-labelledby="round-focus-title"
      data-round-focus={selected ?? "none"}
    >
      <h2
        id="round-focus-title"
        className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
      >
        <GameIcon name="rounds" className="size-4 text-primary" />
        {t("vgl4.round.title")}
      </h2>
      <RoundJump rounds={rounds} selected={selected} onSelect={setSelected} />
      {round ? (
        <div
          key={round.roundNumber}
          className="vgl-rise grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
        >
          <div className="min-w-0 space-y-4">
            <header className="flex flex-wrap items-center gap-3" data-round-focus-header>
              <span className="font-display text-3xl font-semibold tabular-nums text-foreground">
                {fill(t("rounds.roundN"), { n: round.roundNumber })}
              </span>
              {round.side ? (
                <span className="inline-flex items-center gap-1.5">
                  <SideLogo side={round.side} className="size-7" />
                  <SideBadge side={round.side} />
                </span>
              ) : null}
              {round.won === null ? (
                <span className="text-muted-foreground">{NOT_AVAILABLE_MARK}</span>
              ) : (
                <ToneBadge tone={round.won ? "brand" : "critical"}>
                  {t(round.won ? "rounds.won" : "rounds.lost")}
                </ToneBadge>
              )}
              {round.overtime ? <ToneBadge tone="neutral">OT</ToneBadge> : null}
              {!round.valid ? (
                <span className="text-xs text-muted-foreground">
                  {t(`rounds.invalid.${round.invalidReason ?? "NO_SIDE"}` as TranslationKey)}
                </span>
              ) : null}
              <Link
                to="/matches/$matchId"
                params={{ matchId }}
                search={{ tab: "replay", round: round.roundNumber }}
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GameIcon name="rounds" className="size-4 text-primary" />
                {t("vgl4.round.replay")}
              </Link>
            </header>
            <EconomyDuel round={round} />
            <RoundFacts round={round} />
            <div>
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t("vgl4.round.feed")}
              </h3>
              {round.timeline.length ? (
                <ol className="space-y-1.5" data-round-focus-feed>
                  {round.timeline.map((e, i) => (
                    <li key={i}>
                      <KillFeedLine
                        e={e}
                        mySide={round.side}
                        sentence={describe(e, round.side)}
                        index={i}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t("rounds.noEvents")}</p>
              )}
            </div>
          </div>
          <RoundRadar matchId={matchId} map={map} round={round.roundNumber} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rounds.noEvents")}</p>
      )}
    </section>
  );
}

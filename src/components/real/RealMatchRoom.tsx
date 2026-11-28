/**
 * UX-1.5 — Sala da Partida (`/matches/$matchId`, Doc. 2 §3 and §11).
 *
 * The match is a place: a context header ("Mirage · 17 nov", date source, rounds, result) and
 * tabs. Every tab is the existing per-match page rendered inside `EmbeddedScope` (no own shell,
 * header or match selector) with the same server function and the same cache key — nothing is
 * recalculated here. The Summary reads the match row the overview already loaded and the round
 * report the Rounds tab already loads.
 */
import { MapTile } from "@/components/common/GameVisuals";
import { MapArt, SideLogo } from "@/components/cs2/Cs2Art";
import { RoundMarks, RoundMarksLegend, ScoreLine } from "@/components/cs2/MatchTimeline";
import { MatchOverview, TabIntro } from "@/components/cs2/MatchOverview";
import { SideBadge, ToneBadge, type BadgeTone } from "@/components/common/VisualBadges";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Film, UserX } from "lucide-react";

import { MetricTerm } from "@/components/common/MetricTerm";
import { MetricCard } from "@/components/common/MetricCard";
import { ChartCard } from "@/components/common/ChartCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { EmbeddedScope } from "@/components/real/MatchScope";
import { RealCombatPage } from "@/components/real/RealCombat";
import { PLAYER_OVERVIEW_QUERY_KEY } from "@/components/real/RealData";
import { RealDeathReviewPage } from "@/components/real/RealDeathReview";
import { RealHeatmapPage, type HeatmapSearch } from "@/components/real/RealHeatmap";
import { RealReplayPage } from "@/components/real/RealReplay";
import { RealRoundsPage, roundsQueryKey } from "@/components/real/RealRounds";
import { RealUtilityPage } from "@/components/real/RealUtility";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import { getPlayerOverview } from "@/lib/playerData.functions";
import type { OverviewMatch } from "@/lib/playerOverview";
import { getMatchRounds } from "@/lib/rounds.functions";
import { cn } from "@/lib/utils";
import { CoachWordCard } from "@/components/coachWord/CoachWordCard";

export const MATCH_ROOM_TABS = [
  "summary",
  "rounds",
  "duels",
  "deaths",
  "utility",
  "map",
  "replay",
] as const;
export type MatchRoomTab = (typeof MATCH_ROOM_TABS)[number];

/** VGL: each area of the room has its own game pictogram (decorative; the tab name stays). */
const TAB_ICON: Record<MatchRoomTab, GameIconName> = {
  summary: "target",
  rounds: "rounds",
  duels: "crosshair",
  deaths: "skull",
  utility: "grenade",
  map: "map",
  replay: "clock",
};

const RESULT_TONE: Record<string, BadgeTone> = { win: "brand", loss: "critical", draw: "context" };

export interface MatchRoomSearch {
  tab?: MatchRoomTab | undefined;
  round?: number | undefined;
  tick?: number | undefined;
  event?: string | undefined;
  layer?: HeatmapSearch["layer"];
  side?: HeatmapSearch["side"];
  level?: HeatmapSearch["level"];
  weapon?: string | undefined;
}

const noop = () => {};

export function RealMatchRoomPage({
  matchId,
  search,
  onSearch,
}: {
  matchId: string;
  search: MatchRoomSearch;
  onSearch: (next: MatchRoomSearch) => void;
}) {
  const t = useT();
  const overview = useQuery({
    queryKey: PLAYER_OVERVIEW_QUERY_KEY,
    queryFn: () => getPlayerOverview(),
  });
  const match = overview.data?.matches.find((m) => m.matchId === matchId) ?? null;
  const tab = search.tab ?? "summary";
  const go = (next: MatchRoomSearch) => onSearch({ ...search, ...next });

  return (
    <AppShell>
      <div className="space-y-6" data-match-room={matchId}>
        <Link
          to="/matches"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t("room.back")}
        </Link>
        {overview.isPending ? (
          <LoadingState />
        ) : overview.isError ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void overview.refetch()}
          />
        ) : !match ? (
          <EmptyState
            icon={<UserX className="size-5" aria-hidden />}
            title={t("room.notFound.title")}
            description={t("room.notFound.description")}
          />
        ) : (
          <>
            <RoomHeader m={match} />
            <RoomTabs matchId={matchId} active={tab} />
            <div role="tabpanel" aria-label={t(`room.tab.${tab}` as TranslationKey)}>
              {tab !== "summary" ? <TabIntro tab={tab} /> : null}
              <EmbeddedScope>
                {tab === "summary" ? (
                  <RoomSummary m={match} />
                ) : tab === "rounds" ? (
                  <RealRoundsPage search={{ matchId }} onSearch={noop} />
                ) : tab === "duels" ? (
                  <RealCombatPage search={{ matchId }} onSearch={noop} />
                ) : tab === "deaths" ? (
                  <RealDeathReviewPage search={{ matchId, event: search.event }} onSearch={noop} />
                ) : tab === "utility" ? (
                  <RealUtilityPage search={{ matchId }} onSearch={noop} />
                ) : tab === "map" ? (
                  <RealHeatmapPage
                    search={{
                      matchId,
                      ...(match.map ? { map: match.map } : {}),
                      layer: search.layer,
                      side: search.side,
                      level: search.level,
                      weapon: search.weapon,
                    }}
                    onSearch={(s) =>
                      go({ layer: s.layer, side: s.side, level: s.level, weapon: s.weapon })
                    }
                  />
                ) : (
                  <RealReplayPage
                    search={{ matchId, round: search.round, tick: search.tick }}
                    onSearch={(s) => go({ round: s.round, tick: s.tick })}
                  />
                )}
              </EmbeddedScope>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/** "Mirage · 17 nov": the visible title is the match itself; "Sala da Partida" is internal. */
export function roomTitle(m: Pick<OverviewMatch, "map" | "playedAt">, intlTag: string): string {
  return `${m.map ? mapDisplayName(m.map) : NOT_AVAILABLE_MARK} · ${formatDate(m.playedAt, intlTag)}`;
}

function RoomHeader({ m }: { m: OverviewMatch }) {
  const t = useT();
  const { intlTag } = useI18n();
  const result =
    m.resultStatus === "UNRESOLVED_BY_DEMO"
      ? t("room.result.unresolved")
      : m.result
        ? `${t(`real.result.${m.result}` as TranslationKey)}${
            m.scorePlayer !== null && m.scoreOpponent !== null
              ? ` ${m.scorePlayer}–${m.scoreOpponent}`
              : ""
          }`
        : t("room.result.unresolved");
  return (
    <header
      className="vgl-rise relative overflow-hidden rounded-xl border border-border shadow-[var(--shadow-elevated)]"
      data-room-header
    >
      <MapArt map={m.map} className="px-5 py-6 sm:px-7 sm:py-7">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/40 to-transparent"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <MapTile map={m.map} size="lg" />
              <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.08em] text-foreground sm:text-3xl">
                {roomTitle(m, intlTag)}
              </h1>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span data-date-source={m.dateSource}>
                {m.dateSource === "processed" ? t("room.date.processed") : t("room.date.played")}
              </span>
              {m.roundsPlayed !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <GameIcon name="rounds" className="size-3.5" />
                  {fill(t("room.rounds"), { n: m.roundsPlayed })}
                </span>
              ) : null}
              {m.result && m.resultStatus !== "UNRESOLVED_BY_DEMO" ? (
                <ToneBadge
                  tone={RESULT_TONE[m.result] ?? "context"}
                  data-room-result={m.resultStatus}
                >
                  {result}
                </ToneBadge>
              ) : (
                <span data-room-result={m.resultStatus}>{result}</span>
              )}
            </p>
          </div>
          {/* The line above already says when the result is not determined: the score block
              only appears with a resolved score. */}
          {m.resultStatus !== "UNRESOLVED_BY_DEMO" &&
          m.scorePlayer !== null &&
          m.scoreOpponent !== null ? (
            <ScoreLine
              result={m.result}
              scorePlayer={m.scorePlayer}
              scoreOpponent={m.scoreOpponent}
            />
          ) : null}
        </div>
      </MapArt>
    </header>
  );
}

function RoomTabs({ matchId, active }: { matchId: string; active: MatchRoomTab }) {
  const t = useT();
  return (
    <nav aria-label={t("room.tabsLabel")} className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {MATCH_ROOM_TABS.map((tab) => (
          <li key={tab}>
            <Link
              to="/matches/$matchId"
              params={{ matchId }}
              // Summary is the room without ?tab: `explicitUndefined` keeps it from matching
              // every tab (TanStack would mark it active, with aria-current, on any ?tab=).
              search={tab === "summary" ? { tab: undefined } : { tab }}
              activeOptions={{ includeSearch: true, explicitUndefined: true }}
              aria-current={tab === active ? "page" : undefined}
              data-room-tab={tab}
              className={cn(
                "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                tab === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <GameIcon
                name={TAB_ICON[tab]}
                className={cn(
                  "mr-1.5 size-4",
                  tab === active ? "text-primary" : "text-muted-foreground",
                )}
              />
              {t(`room.tab.${tab}` as TranslationKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function RoomSummary({ m }: { m: OverviewMatch }) {
  const t = useT();
  const { intlTag } = useI18n();
  const num = (v: number | null, d: number) => (v === null ? null : formatNumber(v, intlTag, d));
  const kd = m.kills !== null && m.deaths ? m.kills / m.deaths : null;
  return (
    <div className="space-y-6" data-room-summary>
      <CoachWordCard section="match" match={m} />
      <section aria-label={t("room.kpis")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          showDemoTag={false}
          label={<MetricTerm id="adr" />}
          icon="crosshair"
          value={num(m.adr, 1)}
          hint={m.adr !== null && m.adrPartial ? t("adr.partial.hint") : undefined}
        />
        <MetricCard
          showDemoTag={false}
          label={<MetricTerm id="kast" />}
          icon="shield"
          value={num(m.kast, 1)}
          unit="%"
        />
        <MetricCard
          showDemoTag={false}
          label={<MetricTerm id="hsPercent" />}
          icon="headshot"
          value={num(m.hsPercent, 1)}
          unit="%"
        />
        <MetricCard
          showDemoTag={false}
          label={<MetricTerm id="kd" />}
          icon="kill"
          value={num(kd, 2)}
        />
      </section>
      <MatchOverview m={m} />
      <RoundStrip matchId={m.matchId} />
      <Link
        to="/matches/$matchId"
        params={{ matchId: m.matchId }}
        search={{ tab: "replay" }}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:border-primary/60"
      >
        <Film className="size-4 text-primary" aria-hidden />
        {t("room.openReplay")}
      </Link>
    </div>
  );
}

/**
 * One square per round from the Rounds report (`cs2.rounds`, same query as the Rounds tab):
 * the player's side and whether that side won. Rounds without a winner or a side show "?" —
 * never a loss — and nothing is turned into a match result or a percentage (R-07).
 */
/**
 * VGL 2.0 continuation: rounds won per side, counted from the same strip (a round counts only
 * when both its side and its outcome are recorded; the rest are reported apart). No rate.
 */
export function sideSplit(rounds: ReadonlyArray<{ side: "CT" | "T" | null; won: boolean | null }>) {
  const out = { CT: { won: 0, lost: 0 }, T: { won: 0, lost: 0 }, unknown: 0 };
  for (const r of rounds) {
    if (!r.side || r.won === null) out.unknown += 1;
    else out[r.side][r.won ? "won" : "lost"] += 1;
  }
  return out;
}

function SideSplit({
  rounds,
}: {
  rounds: ReadonlyArray<{ side: "CT" | "T" | null; won: boolean | null }>;
}) {
  const t = useT();
  const s = sideSplit(rounds);
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2" data-side-split>
      {(["CT", "T"] as const).map((side) => {
        const { won, lost } = s[side];
        const total = won + lost;
        return (
          <div
            key={side}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-3",
              side === "CT" ? "border-side-ct/35 bg-side-ct/8" : "border-side-t/35 bg-side-t/8",
            )}
            data-side-split-side={side}
          >
            <SideLogo side={side} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <SideBadge side={side} />
                <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                  {total ? `${won} / ${total}` : NOT_AVAILABLE_MARK}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("vgl.room.sideRoundsWon")}</p>
              {total ? (
                <span aria-hidden className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("vgl-grow h-full", side === "CT" ? "bg-side-ct" : "bg-side-t")}
                    style={{ width: `${(won / total) * 100}%` }}
                  />
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
      {s.unknown ? (
        <p
          className="text-xs text-muted-foreground sm:col-span-2"
          data-side-split-unknown={s.unknown}
        >
          {fill(t("vgl.room.sideUnknown"), { n: s.unknown })}
        </p>
      ) : null}
    </div>
  );
}

function RoundStrip({ matchId }: { matchId: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: roundsQueryKey({ matchId }),
    queryFn: () => getMatchRounds({ data: { matchId } }),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data || q.data.status !== "OK") return null;
  const rounds = q.data.rounds;
  return (
    <ChartCard
      title={t("room.strip.title")}
      subtitle={t("room.strip.subtitle")}
      showDemoTag={false}
    >
      <SideSplit rounds={rounds} />
      <ol className="flex flex-wrap gap-1.5" data-round-strip>
        {rounds.map((r, i) => {
          // A real change of the player's side between two consecutive recorded rounds.
          const prev = i > 0 ? rounds[i - 1]!.side : null;
          const switched = !!(prev && r.side && prev !== r.side);
          const state = r.side && r.won !== null ? (r.won ? "won" : "lost") : "unknown";
          const label = fill(t("room.strip.round"), {
            n: r.roundNumber,
            side: r.side ?? NOT_AVAILABLE_MARK,
            outcome: t(`room.strip.${state}` as TranslationKey),
          });
          return (
            <li key={r.roundNumber} className="flex items-start gap-1.5">
              {switched ? (
                <span
                  className="mx-1 h-8 w-px bg-border-strong"
                  data-side-switch
                  title={t("room.strip.sideSwitch")}
                >
                  <span className="sr-only">{t("room.strip.sideSwitch")}</span>
                </span>
              ) : null}
              <span className="flex flex-col items-center gap-0.5">
                <Link
                  to="/matches/$matchId"
                  params={{ matchId }}
                  search={{ tab: "replay", round: r.roundNumber }}
                  title={label}
                  aria-label={label}
                  data-round={r.roundNumber}
                  data-outcome={state}
                  className={cn(
                    "flex size-8 items-center justify-center rounded border font-mono text-xs",
                    state === "unknown"
                      ? "border-dashed border-border text-muted-foreground"
                      : r.side === "CT"
                        ? "border-side-ct text-side-ct"
                        : "border-side-t text-side-t",
                    state === "won" && (r.side === "CT" ? "bg-side-ct/25" : "bg-side-t/25"),
                  )}
                >
                  {state === "unknown" ? "?" : r.roundNumber}
                </Link>
                <RoundMarks r={r} />
              </span>
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <SideBadge side="CT" />
          <SideBadge side="T" />
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded border border-side-ct bg-side-ct/25"
            aria-hidden
          />
          {t("room.strip.won")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-side-ct" aria-hidden />
          {t("room.strip.lost")}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded border border-dashed border-border"
            aria-hidden
          />
          {t("room.strip.unknown")}
        </li>
      </ul>
      <div className="mt-2">
        <RoundMarksLegend />
      </div>
    </ChartCard>
  );
}

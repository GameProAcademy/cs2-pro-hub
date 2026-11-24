/**
 * PM2 / 4.2.4 — 2D replay page. Renders `cs2.replay-segment.v1`: one round at a time, observed
 * samples solid, interpolated positions dashed and only between two observed samples of a living
 * player, gaps never drawn, dead players as a cross at their last observed point. Only on a
 * VALIDATED map. Controls: play/pause, step, speed, timeline, player highlight, previous/next
 * event, event list. Keyboard: space, arrows.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Film,
  MapPinned,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { SaveMomentButton } from "@/components/moments/SaveMoment";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { MatchSelectSlot, MaybePageHeader, MaybeShell } from "@/components/real/MatchScope";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { replaySlotLabel } from "@/lib/replay/slotLabel";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import { getReplayMatches, getReplaySegment, type ReplayResponse } from "@/lib/replay.functions";
import { positionAt, type ReplayEvent, type ReplaySegment } from "@/lib/replay/segment";
import { RADAR_SIZE } from "@/lib/spatial/maps";
import { radarAsset } from "@/lib/spatial/radarAssets";

export interface ReplaySearch {
  matchId?: string | undefined;
  round?: number | undefined;
  tick?: number | undefined;
}

export interface ReplayMatchOption {
  matchId: string;
  map: string | null;
  playedAt: string;
}

const SPEEDS = [0.5, 1, 2, 4] as const;
/** Nominal playback when the round has no proven tick/time relation (samples per second). */
const NOMINAL_SAMPLES_PER_SECOND = 4;

export function RealReplayPage({
  search,
  onSearch,
}: {
  search: ReplaySearch;
  onSearch: (next: ReplaySearch) => void;
}) {
  const list = useQuery({
    queryKey: ["player", "replay", "matches"],
    queryFn: () => getReplayMatches(),
  });
  const matches: ReplayMatchOption[] = list.data ?? [];
  const t = useT();
  const { intlTag } = useI18n();
  const matchId = search.matchId ?? matches[0]?.matchId;
  const query = useQuery({
    queryKey: ["player", "replay", matchId ?? null, search.round ?? null],
    queryFn: () =>
      getReplaySegment({
        data: { matchId: matchId!, ...(search.round !== undefined ? { round: search.round } : {}) },
      }),
    enabled: Boolean(matchId),
  });
  return (
    <MaybeShell>
      <div className="space-y-6">
        <MaybePageHeader
          eyebrow={t("replay.eyebrow")}
          title={t("replay.title")}
          description={t("replay.description")}
        />
        {matches.length ? (
          <MatchSelectSlot>
            <label className="flex max-w-md flex-col gap-1 text-xs text-muted-foreground">
              <span className="font-mono uppercase tracking-[0.12em]">
                {t("replay.filter.match")}
              </span>
              <select
                name="match"
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                // A match id outside the caller's own list (NOT_FOUND) never shows another match as selected.
                value={matchId && matches.some((m) => m.matchId === matchId) ? matchId : ""}
                onChange={(e) => onSearch({ matchId: e.target.value })}
              >
                {matchId && !matches.some((m) => m.matchId === matchId) ? (
                  <option value="">{NOT_AVAILABLE_MARK}</option>
                ) : null}
                {matches.map((m) => (
                  <option key={m.matchId} value={m.matchId}>
                    {`${formatDate(m.playedAt, intlTag)} · ${m.map ? mapDisplayName(m.map) : NOT_AVAILABLE_MARK}`}
                  </option>
                ))}
              </select>
            </label>
          </MatchSelectSlot>
        ) : null}
        {list.isPending ? (
          <LoadingState />
        ) : !matchId ? (
          <EmptyState
            icon={<Film className="size-5" aria-hidden />}
            title={t("diagnosis.empty.title")}
          />
        ) : query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ReplayBody
            r={query.data}
            initialTick={search.tick}
            onRound={(round) => onSearch({ matchId, round })}
            matchId={matchId}
          />
        )}
      </div>
    </MaybeShell>
  );
}

export function ReplayBody({
  r,
  initialTick,
  onRound,
  matchId,
}: {
  r: ReplayResponse;
  initialTick?: number | undefined;
  onRound: (round: number) => void;
  /** PM5: lets the player save the current moment of this match (module I). */
  matchId?: string | undefined;
}) {
  const t = useT();
  if (r.status === "NOT_FOUND" || r.status === "NO_PARTICIPANT")
    return (
      <div data-replay-status={r.status}>
        <EmptyState
          icon={<UserX className="size-5" aria-hidden />}
          title={t(`replay.state.${r.status}.title` as TranslationKey)}
          description={t(`replay.state.${r.status}.body` as TranslationKey)}
        />
      </div>
    );
  if (r.status === "NOT_RECORDED" || r.status === "UNAVAILABLE")
    return (
      <div data-replay-status={r.status}>
        <EmptyState
          icon={<Film className="size-5" aria-hidden />}
          title={t(`replay.state.${r.status}.title` as TranslationKey)}
          description={t(`replay.state.${r.status}.body` as TranslationKey)}
        />
      </div>
    );
  if (r.status === "MAP_NOT_VALIDATED" || r.status === "UNKNOWN_MAP")
    return (
      <div data-replay-status={r.status}>
        <EmptyState
          icon={<MapPinned className="size-5" aria-hidden />}
          title={t(`replay.state.${r.status}.title` as TranslationKey)}
          description={t(`replay.state.${r.status}.body` as TranslationKey)}
        />
      </div>
    );
  if (r.status !== "OK" && r.status !== "ROUND_UNAVAILABLE") return null;
  return (
    <div
      className="space-y-4"
      data-replay-status={r.status}
      data-trajectory-status={r.trajectoryStatus}
    >
      {r.trajectoryStatus === "PARTIAL" ? (
        <p className="text-sm text-muted-foreground">{t("replay.partial")}</p>
      ) : null}
      <nav aria-label={t("replay.rounds")} className="flex flex-wrap gap-1.5">
        {r.rounds.map((round) => (
          <button
            key={round.number}
            type="button"
            onClick={() => onRound(round.number)}
            aria-current={round.number === r.round ? "true" : undefined}
            title={t(`replay.availability.${round.availability}` as TranslationKey)}
            data-availability={round.availability}
            className={
              round.number === r.round
                ? "min-w-9 rounded border border-primary bg-primary/15 px-2 py-1 text-xs text-foreground"
                : round.availability === "AVAILABLE"
                  ? "min-w-9 rounded border border-border px-2 py-1 text-xs text-foreground"
                  : "min-w-9 rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground"
            }
          >
            {round.number}
          </button>
        ))}
      </nav>
      {r.status === "ROUND_UNAVAILABLE" || !r.segment ? (
        <EmptyState
          icon={<Film className="size-5" aria-hidden />}
          title={t("replay.state.ROUND_UNAVAILABLE.title")}
          description={t(`replay.availability.${r.availability}` as TranslationKey)}
        />
      ) : (
        <ReplayPlayer
          key={`${r.round}`}
          segment={r.segment}
          map={r.map}
          initialTick={initialTick}
          {...(matchId ? { moment: { matchId, round: r.round } } : {})}
        />
      )}
    </div>
  );
}

const sideClass = (side: "T" | "CT") =>
  side === "CT" ? "fill-side-ct stroke-side-ct" : "fill-side-t stroke-side-t";

export function ReplayPlayer({
  segment,
  map,
  initialTick,
  moment,
}: {
  segment: ReplaySegment;
  map: string;
  initialTick?: number | undefined;
  moment?: { matchId: string; round: number };
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const last = segment.sampleCount - 1;
  const toIndex = (tick: number) =>
    Math.min(last, Math.max(0, (tick - segment.firstTick) / segment.stepTicks));
  const [pos, setPos] = useState(() =>
    initialTick !== undefined ? Math.round(toIndex(initialTick)) : 0,
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [focus, setFocus] = useState<string>("you");
  const frame = useRef<number | null>(null);
  const samplesPerSecond = segment.ticksPerSecond
    ? segment.ticksPerSecond / segment.stepTicks
    : NOMINAL_SAMPLES_PER_SECOND;

  useEffect(() => {
    if (!playing) return;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      setPos((p) => {
        const next = p + dt * samplesPerSecond * speed;
        if (next >= last) {
          setPlaying(false);
          return last;
        }
        return next;
      });
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [playing, speed, samplesPerSecond, last]);

  const tick = Math.round(segment.firstTick + pos * segment.stepTicks);
  const timeLabel = segment.ticksPerSecond
    ? fill(t("replay.time.seconds"), {
        s: formatNumber((tick - segment.firstTick) / segment.ticksPerSecond, intlTag, 1),
      })
    : fill(t("replay.time.ticks"), { t: tick });
  const eventIndex = (e: ReplayEvent) => toIndex(e.tick);
  const prevEvent = [...segment.events].reverse().find((e) => eventIndex(e) < pos - 1e-6);
  const nextEvent = segment.events.find((e) => eventIndex(e) > pos + 1e-6);
  const step = (d: number) => {
    setPlaying(false);
    setPos((p) => Math.min(last, Math.max(0, Math.round(p) + d)));
  };
  const slotLabel = (slot: string | null) => replaySlotLabel(slot, t);
  const background = useMemo(() => radarAsset(map, "default"), [map]);

  return (
    <ChartCard
      title={fill(t("replay.round"), { n: segment.round })}
      subtitle={fill(t("replay.coverage"), {
        observed: segment.coverage.observedSamples,
        possible: segment.coverage.possibleSamples,
        players: segment.coverage.players,
        step: segment.stepTicks,
      })}
      showDemoTag={false}
    >
      <div
        className="grid gap-5 lg:grid-cols-[minmax(0,640px)_1fr]"
        tabIndex={0}
        aria-label={t("replay.keyboard")}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            setPlaying((p) => !p);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          }
        }}
      >
        <div className="space-y-3">
          <svg
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            className="aspect-square w-full rounded-md border border-border bg-secondary/40"
            role="img"
            aria-label={`${mapDisplayName(map)} · ${fill(t("replay.round"), { n: segment.round })} · ${timeLabel}`}
            data-replay-svg
          >
            {background ? (
              <image
                href={background.src}
                x={0}
                y={0}
                width={RADAR_SIZE}
                height={RADAR_SIZE}
                preserveAspectRatio="none"
              />
            ) : null}
            {segment.players.map((p) => {
              const at = positionAt(p, pos);
              if (!at) return null;
              const highlighted = focus === p.slot;
              const r = highlighted ? 16 : 12;
              return (
                <g
                  key={p.slot}
                  data-slot={p.slot}
                  data-interpolated={at.interpolated}
                  data-dead={at.dead}
                >
                  {at.dead ? (
                    <g className={sideClass(p.side)} strokeWidth={5} opacity={0.7}>
                      <line x1={at.x - r} y1={at.y - r} x2={at.x + r} y2={at.y + r} />
                      <line x1={at.x - r} y1={at.y + r} x2={at.x + r} y2={at.y - r} />
                    </g>
                  ) : (
                    <circle
                      cx={at.x}
                      cy={at.y}
                      r={r}
                      className={sideClass(p.side)}
                      fillOpacity={at.interpolated ? 0.45 : 1}
                      stroke={p.isYou || highlighted ? "white" : "black"}
                      strokeWidth={p.isYou || highlighted ? 4 : 2}
                      strokeDasharray={at.interpolated ? "5 4" : undefined}
                    />
                  )}
                  <text
                    x={at.x}
                    y={at.y - r - 6}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize={22}
                    fontWeight={p.isYou ? 700 : 400}
                  >
                    {slotLabel(p.slot)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-border p-1.5"
              aria-label={t("replay.prevEvent")}
              disabled={!prevEvent}
              onClick={() => prevEvent && (setPlaying(false), setPos(eventIndex(prevEvent)))}
            >
              <SkipBack className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded border border-border p-1.5"
              aria-label={t("replay.stepBack")}
              onClick={() => step(-1)}
            >
              <StepBack className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded border border-primary bg-primary/15 p-1.5"
              aria-label={playing ? t("replay.pause") : t("replay.play")}
              aria-pressed={playing}
              onClick={() => {
                if (!playing && pos >= last) setPos(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="rounded border border-border p-1.5"
              aria-label={t("replay.stepForward")}
              onClick={() => step(1)}
            >
              <StepForward className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded border border-border p-1.5"
              aria-label={t("replay.nextEvent")}
              disabled={!nextEvent}
              onClick={() => nextEvent && (setPlaying(false), setPos(eventIndex(nextEvent)))}
            >
              <SkipForward className="size-4" aria-hidden />
            </button>
            <label className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
              {t("replay.speed")}
              <select
                className="h-8 rounded border border-border bg-background px-1 text-xs text-foreground"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>{`${s}×`}</option>
                ))}
              </select>
            </label>
            <span
              className="ml-auto font-mono text-xs text-foreground"
              aria-live="off"
              data-replay-time
            >
              {timeLabel}
            </span>
            {moment ? (
              <SaveMomentButton
                compact
                matchId={moment.matchId}
                round={moment.round}
                tick={tick}
                source="REPLAY"
                defaultTitle={fill(t("moments.defaultTitle.replay"), {
                  n: moment.round,
                  time: timeLabel,
                })}
              />
            ) : null}
          </div>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={Math.round(pos)}
            aria-label={t("replay.timeline")}
            aria-valuetext={timeLabel}
            onChange={(e) => {
              setPlaying(false);
              setPos(Number(e.target.value));
            }}
            // UX-1.9a: 24 px touch height (WCAG 2.5.8); the track keeps its native look.
            className="h-6 w-full cursor-pointer"
          />
          {segment.ticksPerSecond ? null : (
            <p className="text-xs text-muted-foreground">{t("replay.time.nominal")}</p>
          )}
          <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-full border-2 border-black bg-side-t"
                aria-hidden
              />
              {t("replay.legend.observed")}
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-full border-2 border-dashed border-black bg-side-t/45"
                aria-hidden
              />
              {t("replay.legend.interpolated")}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden>✕</span>
              {t("replay.legend.dead")}
            </li>
            <li>{t("replay.legend.gap")}</li>
          </ul>
        </div>
        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="font-mono uppercase tracking-[0.12em]">{t("replay.focus")}</span>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            >
              <option value="">{t("replay.focus.none")}</option>
              {segment.players.map((p) => (
                <option key={p.slot} value={p.slot}>
                  {`${slotLabel(p.slot)} · ${p.side}`}
                </option>
              ))}
            </select>
          </label>
          <section aria-labelledby="replay-events">
            <h3 id="replay-events" className="mb-2 text-xs font-semibold uppercase tracking-wide">
              {t("replay.events")}
            </h3>
            {segment.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("replay.events.none")}</p>
            ) : (
              <ol className="space-y-1">
                {segment.events.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={
                        e.involvesYou
                          ? "w-full rounded px-2 py-1 text-left text-sm font-medium text-foreground hover:bg-secondary"
                          : "w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-secondary"
                      }
                      aria-label={`${t("replay.event.jump")}: ${eventText(e, t, slotLabel)}`}
                      onClick={() => {
                        setPlaying(false);
                        setPos(eventIndex(e));
                      }}
                      data-event={e.type}
                    >
                      <span className="mr-2 font-mono text-xs">
                        {segment.ticksPerSecond
                          ? `${formatNumber((e.tick - segment.firstTick) / segment.ticksPerSecond, intlTag, 1)} s`
                          : e.tick}
                      </span>
                      {eventText(e, t, slotLabel)}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </ChartCard>
  );
}

function eventText(
  e: ReplayEvent,
  t: (k: TranslationKey) => string,
  slotLabel: (s: string | null) => string,
) {
  if (e.type !== "kill") return t(`replay.event.${e.type}` as TranslationKey);
  return (
    fill(t("replay.event.kill"), {
      actor:
        e.actorSlot === null && e.weapon === "planted_c4"
          ? t("replay.event.world")
          : slotLabel(e.actorSlot),
      victim: slotLabel(e.victimSlot),
    }) + (e.weapon ? ` · ${e.weapon}` : "")
  );
}

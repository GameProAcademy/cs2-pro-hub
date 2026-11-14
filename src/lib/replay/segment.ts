/**
 * PM2 4.2.4 — `cs2.replay-segment.v1`: one round of the 2D replay, built from stored trajectories
 * (`cs2.round-trajectory.v1`) and the round's events. Pure.
 *
 *  - Players are labelled by side and slot ("you", "T1".."T5", "CT1".."CT5"); no SteamID, name
 *    or nickname ever leaves the server.
 *  - Positions are drawn only on a VALIDATED map; a world position outside the radar frame is a
 *    gap (never clamped).
 *  - Each sample is an observed entity read; the UI may interpolate only between two consecutive
 *    observed samples of a living player and must mark it as interpolated. Gaps are never
 *    bridged (`interpolable[i]` is false when sample i or i+1 is missing or dead).
 *  - Ticks are converted to seconds only through the round's own tick/time pairs when they agree
 *    (one rate within 1%); otherwise `ticksPerSecond` is null and the timeline is in ticks.
 */
import { mapSupport, worldToRadar, type MapLevel } from "@/lib/spatial/maps";

import { decodeAlive, decodeSamples } from "./trajectory";

export const REPLAY_SEGMENT_VERSION = "cs2.replay-segment.v1";

export interface StoredTrajectoryPlayer {
  participant_key: string;
  side: "T" | "CT";
  xyz: string;
  alive: string;
}

export interface StoredRoundTrajectory {
  round_number: number;
  first_tick: number;
  end_tick: number;
  step_ticks: number;
  sample_count: number;
  players: StoredTrajectoryPlayer[];
}

export interface ReplayEventRow {
  id: string;
  tick: number | null;
  timeSeconds: number | null;
  type: string;
  actor: string | null;
  victim: string | null;
  weapon: string | null;
  headshot: boolean | null;
}

export interface ReplayPlayer {
  slot: string;
  side: "T" | "CT";
  isYou: boolean;
  /** Radar pixels per sample; null = no observed position (gap or off-frame). */
  points: ([number, number, MapLevel] | null)[];
  alive: (boolean | null)[];
  /** interpolable[i]: an interpolated position may be shown between samples i and i+1. */
  interpolable: boolean[];
  observedSamples: number;
}

export interface ReplayEvent {
  id: string;
  tick: number;
  type: "kill" | "bomb_plant" | "bomb_defuse" | "bomb_explode";
  actorSlot: string | null;
  victimSlot: string | null;
  weapon: string | null;
  headshot: boolean | null;
  involvesYou: boolean;
}

export interface ReplaySegment {
  version: typeof REPLAY_SEGMENT_VERSION;
  round: number;
  firstTick: number;
  endTick: number;
  stepTicks: number;
  sampleCount: number;
  ticksPerSecond: number | null;
  players: ReplayPlayer[];
  events: ReplayEvent[];
  coverage: { players: number; observedSamples: number; possibleSamples: number };
}

/** Pure: one tick rate from the round's own (tick, time) pairs, or null when they disagree. */
export function ticksPerSecond(
  pairs: Array<{ tick: number | null; timeSeconds: number | null }>,
): number | null {
  const ok = pairs
    .filter(
      (p): p is { tick: number; timeSeconds: number } =>
        Number.isFinite(p.tick) && Number.isFinite(p.timeSeconds),
    )
    .sort((a, b) => a.tick - b.tick);
  const rates: number[] = [];
  for (let i = 1; i < ok.length; i++) {
    const dt = ok[i]!.timeSeconds - ok[i - 1]!.timeSeconds;
    const dk = ok[i]!.tick - ok[i - 1]!.tick;
    if (dt > 0 && dk > 0) rates.push(dk / dt);
  }
  if (rates.length < 1) return null;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return rates.every((r) => Math.abs(r - mean) / mean <= 0.01)
    ? Math.round(mean * 1000) / 1000
    : null;
}

const EVENT_TYPES = new Set(["kill", "bomb_plant", "bomb_defuse", "bomb_explode"]);

export function buildReplaySegment(args: {
  map: string | null;
  round: StoredRoundTrajectory;
  ownKey: string;
  events: ReplayEventRow[];
}): ReplaySegment | null {
  const support = mapSupport(args.map);
  if (support.status !== "SUPPORTED") return null;
  const r = args.round;
  const slots = new Map<string, string>();
  const counters = { T: 0, CT: 0 };
  const ordered = [...r.players].sort(
    (a, b) => a.side.localeCompare(b.side) || a.participant_key.localeCompare(b.participant_key),
  );
  for (const p of ordered) {
    if (p.participant_key === args.ownKey) slots.set(p.participant_key, "you");
    else slots.set(p.participant_key, `${p.side}${++counters[p.side]}`);
  }
  let observed = 0;
  const players: ReplayPlayer[] = ordered.map((p) => {
    const samples = decodeSamples(p.xyz, r.sample_count);
    const alive = decodeAlive(p.alive);
    const points = samples.map((s) => {
      if (!s) return null;
      const radar = worldToRadar(support.overview, s);
      return radar.ok
        ? ([
            Math.round(radar.point.x * 10) / 10,
            Math.round(radar.point.y * 10) / 10,
            radar.point.level,
          ] as [number, number, MapLevel])
        : null;
    });
    const count = points.filter(Boolean).length;
    observed += count;
    const interpolable = points.map(
      (pt, i) =>
        i + 1 < points.length &&
        pt !== null &&
        points[i + 1] !== null &&
        alive[i] === true &&
        alive[i + 1] === true,
    );
    return {
      slot: slots.get(p.participant_key)!,
      side: p.side,
      isYou: p.participant_key === args.ownKey,
      points,
      alive,
      interpolable,
      observedSamples: count,
    };
  });
  const events: ReplayEvent[] = args.events
    .filter(
      (e): e is ReplayEventRow & { tick: number } =>
        EVENT_TYPES.has(e.type) && Number.isFinite(e.tick),
    )
    .filter((e) => e.tick >= r.first_tick - r.step_ticks && e.tick <= r.end_tick)
    .sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id))
    .map((e) => ({
      id: e.id,
      tick: e.tick,
      type: e.type as ReplayEvent["type"],
      actorSlot: e.actor ? (slots.get(e.actor) ?? null) : null,
      victimSlot: e.victim ? (slots.get(e.victim) ?? null) : null,
      weapon: e.weapon,
      headshot: e.headshot,
      involvesYou: e.actor === args.ownKey || e.victim === args.ownKey,
    }));
  return {
    version: REPLAY_SEGMENT_VERSION,
    round: r.round_number,
    firstTick: r.first_tick,
    endTick: r.end_tick,
    stepTicks: r.step_ticks,
    sampleCount: r.sample_count,
    ticksPerSecond: ticksPerSecond(args.events),
    players,
    events,
    coverage: {
      players: players.length,
      observedSamples: observed,
      possibleSamples: players.length * r.sample_count,
    },
  };
}

/**
 * Pure: the position to draw for a player at a fractional sample index t.
 *  - integer t with an observed sample → that sample (observed);
 *  - strictly between two interpolable samples → linear interpolation, flagged `interpolated`;
 *  - a dead player (alive[i] === false) keeps the observed point of sample i (`dead`), since a
 *    body does not move;
 *  - anything else (gap, unread, next sample missing) → null. Never extrapolates.
 */
export function positionAt(
  p: Pick<ReplayPlayer, "points" | "interpolable" | "alive">,
  t: number,
): { x: number; y: number; level: MapLevel; interpolated: boolean; dead: boolean } | null {
  if (!(t >= 0) || t > p.points.length - 1) return null;
  const i = Math.floor(t);
  const frac = t - i;
  const a = p.points[i];
  if (!a) return null;
  const dead = p.alive[i] === false;
  if (frac === 0 || dead) return { x: a[0], y: a[1], level: a[2], interpolated: false, dead };
  const b = p.points[i + 1];
  if (!b || !p.interpolable[i]) return null;
  return {
    x: a[0] + (b[0] - a[0]) * frac,
    y: a[1] + (b[1] - a[1]) * frac,
    level: frac < 0.5 ? a[2] : b[2],
    interpolated: true,
    dead: false,
  };
}

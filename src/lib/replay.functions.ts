/**
 * PM2 4.2.4 — replay segment read (`cs2.replay-segment.v1`): ONE round per request, never the whole
 * demo. Read-only under the caller's own session (RLS `owns_canonical_match` on
 * match_trajectories / round_trajectories / round_events / match_rounds); a match id outside the
 * caller's overview is never queried (NOT_FOUND). No SteamID, name or nickname is returned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import { stageTimer } from "@/lib/serverTiming";
import {
  buildReplaySegment,
  type ReplaySegment,
  type StoredRoundTrajectory,
  type StoredTrajectoryPlayer,
} from "@/lib/replay/segment";
import { mapSupport } from "@/lib/spatial/maps";
import { ownParticipantKeys } from "@/lib/xray.functions";

/** Events read for one round; a round never has this many kills/objectives. */
export const REPLAY_EVENTS_PER_ROUND_LIMIT = 500;

export const replayInput = z
  .object({
    matchId: z.string().uuid(),
    round: z.number().int().min(0).max(256).optional(),
  })
  .strict();

export type RoundAvailability =
  "AVAILABLE" | "VOIDED_OR_UNKNOWN" | "WINDOW_UNKNOWN" | "ROUND_TOO_LONG" | "LIMIT" | "NOT_SAMPLED";

export type ReplayResponse =
  | { status: "NOT_FOUND" }
  | { status: "NO_PARTICIPANT" }
  | { status: "NOT_RECORDED"; map: string | null }
  | { status: "UNAVAILABLE"; map: string | null; reason: string | null }
  | {
      status: "MAP_NOT_VALIDATED" | "UNKNOWN_MAP";
      map: string | null;
      rounds: Array<{ number: number; availability: RoundAvailability }>;
    }
  | {
      status: "ROUND_UNAVAILABLE" | "OK";
      map: string;
      trajectoryStatus: "COMPLETE" | "PARTIAL";
      round: number;
      availability: RoundAvailability;
      rounds: Array<{ number: number; availability: RoundAvailability }>;
      segment: ReplaySegment | null;
    };

/** Pure: availability of each played round from match_rounds, the stored rounds and the skips. */
export function roundAvailability(
  playedRounds: number[],
  storedRounds: number[],
  skipped: Array<{ round: number | null; reason: string | null }>,
): Array<{ number: number; availability: RoundAvailability }> {
  const stored = new Set(storedRounds);
  const skip = new Map(
    skipped.filter((s) => s.round !== null).map((s) => [s.round as number, s.reason]),
  );
  const all = [...new Set([...playedRounds, ...storedRounds])].sort((a, b) => a - b);
  const played = new Set(playedRounds);
  return all.map((number) => {
    if (!played.has(number)) return { number, availability: "VOIDED_OR_UNKNOWN" as const };
    if (stored.has(number)) return { number, availability: "AVAILABLE" as const };
    const reason = skip.get(number);
    return {
      number,
      availability:
        reason === "WINDOW_UNKNOWN" || reason === "ROUND_TOO_LONG" || reason === "LIMIT"
          ? reason
          : ("NOT_SAMPLED" as const),
    };
  });
}

export const getReplaySegment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => replayInput.parse(input))
  .handler(async ({ context, data }): Promise<ReplayResponse> => {
    const { supabase, userId } = context;
    // PM3 observability: per-stage durations in a Server-Timing header (no behaviour change).
    const timer = stageTimer();
    try {
      return await replaySegment(supabase, userId, data, timer);
    } finally {
      timer.emit();
    }
  });

async function replaySegment(
  supabase: Parameters<typeof loadPlayerOverview>[0],
  userId: string,
  data: z.infer<typeof replayInput>,
  timer: ReturnType<typeof stageTimer>,
): Promise<ReplayResponse> {
  const overview = await loadPlayerOverview(supabase, userId);
  timer.mark("overview");
  const match = overview.matches.find((m) => m.matchId === data.matchId);
  if (!match) return { status: "NOT_FOUND" };
  const playerIds = await ownPlayerIds(supabase, userId, "REPLAY");
  const keys = playerIds.length
    ? await ownParticipantKeys(supabase, playerIds, [match.matchId])
    : new Map();
  const ownKey = keys.get(match.matchId);
  timer.mark("ownership");
  if (!ownKey) return { status: "NO_PARTICIPANT" };

  const { data: status, error: statusError } = await supabase
    .from("match_trajectories")
    .select("status, reason, skipped")
    .eq("match_id", match.matchId)
    .maybeSingle();
  timer.mark("trajectory_status");
  if (statusError) throw new Error(`REPLAY_READ_FAILED:${statusError.code ?? "unknown"}`);
  if (!status) return { status: "NOT_RECORDED", map: match.map };
  if (status.status === "UNAVAILABLE")
    return { status: "UNAVAILABLE", map: match.map, reason: status.reason };

  const [played, stored] = await Promise.all([
    supabase
      .from("match_rounds")
      .select("round_number, start_tick, end_tick")
      .eq("match_id", match.matchId),
    supabase.from("round_trajectories").select("round_number").eq("match_id", match.matchId),
  ]);
  timer.mark("rounds");
  const failed = played.error ?? stored.error;
  if (failed) throw new Error(`REPLAY_READ_FAILED:${failed.code ?? "unknown"}`);
  const skipped = Array.isArray(status.skipped)
    ? (status.skipped as Array<{ round: number | null; reason: string | null }>)
    : [];
  const rounds = roundAvailability(
    (played.data ?? [])
      .filter((r) => r.start_tick !== null && r.end_tick !== null && r.end_tick >= r.start_tick)
      .map((r) => r.round_number),
    (stored.data ?? []).map((r) => r.round_number),
    skipped,
  );
  const support = mapSupport(match.map).status;
  if (support !== "SUPPORTED")
    return {
      status: support === "NOT_VALIDATED" ? "MAP_NOT_VALIDATED" : "UNKNOWN_MAP",
      map: match.map,
      rounds,
    };

  const roundNumber =
    data.round ??
    rounds.find((r) => r.availability === "AVAILABLE")?.number ??
    rounds[0]?.number ??
    1;
  const availability =
    rounds.find((r) => r.number === roundNumber)?.availability ?? "VOIDED_OR_UNKNOWN";
  const base = {
    map: match.map as string,
    trajectoryStatus: status.status as "COMPLETE" | "PARTIAL",
    round: roundNumber,
    availability,
    rounds,
  };
  if (availability !== "AVAILABLE") return { status: "ROUND_UNAVAILABLE", ...base, segment: null };

  const [traj, events] = await Promise.all([
    supabase
      .from("round_trajectories")
      .select("round_number, first_tick, end_tick, step_ticks, sample_count, players")
      .eq("match_id", match.matchId)
      .eq("round_number", roundNumber)
      .maybeSingle(),
    supabase
      .from("round_events")
      .select(
        "id, tick, time_seconds, event_type, actor_steam_id, victim_steam_id, weapon, headshot",
      )
      .eq("match_id", match.matchId)
      .eq("round_number", roundNumber)
      .in("event_type", ["kill", "bomb_plant", "bomb_defuse", "bomb_explode"])
      .limit(REPLAY_EVENTS_PER_ROUND_LIMIT),
  ]);
  timer.mark("segment_reads");
  const readError = traj.error ?? events.error;
  if (readError) throw new Error(`REPLAY_READ_FAILED:${readError.code ?? "unknown"}`);
  if (!traj.data)
    return { status: "ROUND_UNAVAILABLE", ...base, availability: "NOT_SAMPLED", segment: null };
  if ((events.data ?? []).length >= REPLAY_EVENTS_PER_ROUND_LIMIT)
    throw new Error("REPLAY_EVENTS_LIMIT");
  const round: StoredRoundTrajectory = {
    ...traj.data,
    players: (Array.isArray(traj.data.players)
      ? traj.data.players
      : []) as unknown as StoredTrajectoryPlayer[],
  };
  const segment = buildReplaySegment({
    map: match.map,
    round,
    ownKey,
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      tick: e.tick,
      timeSeconds:
        typeof e.time_seconds === "number"
          ? e.time_seconds
          : e.time_seconds === null
            ? null
            : Number(e.time_seconds),
      type: e.event_type,
      actor: e.actor_steam_id,
      victim: e.victim_steam_id,
      weapon: e.weapon,
      headshot: e.headshot,
    })),
  });
  timer.mark("build");
  console.info(
    JSON.stringify({
      event: "replay_segment",
      version: segment?.version ?? null,
      samples: segment?.sampleCount ?? 0,
      players: segment?.coverage.players ?? 0,
      observed: segment?.coverage.observedSamples ?? 0,
    }),
  );
  return { status: "OK", ...base, segment };
}

/** The caller's own matches for the replay selector (newest first, at most 50). */
export const getReplayMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    return [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, 50)
      .map((m) => ({ matchId: m.matchId, map: m.map, playedAt: m.playedAt }));
  });

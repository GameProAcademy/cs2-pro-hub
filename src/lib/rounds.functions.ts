/**
 * PM4 / Fase 4.2.7 — round review read (`cs2.rounds.v1` + `cs2.economy.v1`), modules E/F.
 *
 * Same security model as /duels and /deaths: every query runs with the signed-in player's own
 * Supabase session (`requireSupabaseAuth`, RLS), never the service role; a match id outside the
 * caller's own overview is never queried (IDOR → NOT_FOUND, identical to a match that does not
 * exist). The response carries team sums and the caller's own facts only: no other player's
 * identity, no per-player money of anyone else.
 */
import { determinedWinnerSide } from "@/lib/rounds/winnerEvidence";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { Side } from "@/lib/diagnosis/deathContext";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import type { OverviewMatch } from "@/lib/playerOverview";
import {
  buildRoundReports,
  summarizeRounds,
  type RoundObjective,
  type RoundReport,
  type RoundsInput,
  type RoundsSummary,
} from "@/lib/rounds/roundImpact";
import { ownParticipantKeys } from "@/lib/xray.functions";

export const roundsInput = z.object({ matchId: z.string().uuid().optional() }).strict();
export const ROUNDS_MAX_MATCHES = 50;
const PAGE = 1000;
export const ROUNDS_ROW_CAP = 20000;
const SAFE_KEY = /^[A-Za-z0-9:_.-]{1,64}$/;

export interface RoundsMatchOption {
  matchId: string;
  map: string | null;
  playedAt: string;
  dateSource: OverviewMatch["dateSource"];
}

export type RoundsResponse = { matches: RoundsMatchOption[] } & (
  | { status: "EMPTY" }
  | { status: "NOT_FOUND" }
  | { status: "NO_PARTICIPANT"; matchId: string }
  | {
      status: "OK";
      matchId: string;
      map: string | null;
      /** Spend per player was recorded (parser R5.8.31+): buys can be classified. */
      spendRecorded: boolean;
      summary: RoundsSummary;
      rounds: RoundReport[];
    }
);

export const getMatchRounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roundsInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<RoundsResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const own = [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, ROUNDS_MAX_MATCHES);
    const matches = own.map((m) => ({
      matchId: m.matchId,
      map: m.map,
      playedAt: m.playedAt,
      dateSource: m.dateSource,
    }));
    if (!own.length) return { matches, status: "EMPTY" };
    // A match id outside the caller's own overview is never queried (IDOR → NOT_FOUND).
    const match = data.matchId ? overview.matches.find((m) => m.matchId === data.matchId) : own[0];
    if (!match) return { matches, status: "NOT_FOUND" };
    const loaded = await loadRoundsInput(context.supabase, context.userId, match.matchId);
    if (!loaded) return { matches, status: "NO_PARTICIPANT", matchId: match.matchId };
    const rounds = buildRoundReports(loaded.input, loaded.participantKey);
    const summary = summarizeRounds(rounds);
    console.info(
      JSON.stringify({
        event: "rounds_report",
        version: summary.version,
        rounds: summary.rounds,
        validRounds: summary.validRounds,
        spendRecorded: loaded.spendRecorded,
      }),
    );
    return {
      matches,
      status: "OK",
      matchId: match.matchId,
      map: match.map,
      spendRecorded: loaded.spendRecorded,
      summary,
      rounds,
    };
  });

type EventRow = {
  id: string;
  event_type: string;
  round_number: number | null;
  tick: number | null;
  time_seconds: number | null;
  actor_steam_id: string | null;
  victim_steam_id: string | null;
  assister_steam_id?: string | null;
  weapon?: string | null;
  headshot?: boolean | null;
  damage?: number | null;
  health_after?: unknown;
  money_spent?: unknown;
  disconnected?: unknown;
};

async function paged(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
  label: string,
): Promise<EventRow[]> {
  const out: EventRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`ROUNDS_READ_FAILED:${label}:${error.code ?? "unknown"}`);
    const rows = (data ?? []) as EventRow[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    if (out.length >= ROUNDS_ROW_CAP) throw new Error(`ROUNDS_ROW_CAP:${label}`);
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asSide = (v: string | null): Side | null => (v === "T" || v === "CT" ? v : null);

/** `{steamId: finite number}` from jsonb, else null (never an empty or coerced map). */
export function numberMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = num(v);
    if (n !== null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

const OBJECTIVE: Record<string, RoundObjective["type"]> = {
  bomb_plant: "bomb_plant",
  bomb_defuse: "bomb_defuse",
  bomb_explode: "bomb_explode",
};

export async function loadRoundsInput(
  supabase: SupabaseClient<Database>,
  userId: string,
  matchId: string,
): Promise<{ participantKey: string; spendRecorded: boolean; input: RoundsInput } | null> {
  const playerIds = await ownPlayerIds(supabase, userId, "ROUNDS");
  if (!playerIds.length) return null;
  const keys = await ownParticipantKeys(supabase, playerIds, [matchId]);
  const participantKey = keys.get(matchId);
  if (!participantKey || !SAFE_KEY.test(participantKey)) return null;
  const ev = () => supabase.from("round_events");
  const base = "id, event_type, round_number, tick, time_seconds, actor_steam_id, victim_steam_id";
  const [rounds, roundPlayers, kills, damage, objectives, ends] = await Promise.all([
    supabase
      .from("match_rounds")
      .select("round_number, start_tick, end_tick, winner_side, win_reason, metadata")
      .eq("match_id", matchId),
    supabase
      .from("round_players")
      .select("round_number, participant_key, side, money_start, equipment_value")
      .eq("match_id", matchId),
    paged(
      (a, b) =>
        ev()
          .select(`${base}, assister_steam_id, weapon, headshot`)
          .eq("match_id", matchId)
          .eq("event_type", "kill")
          .order("tick")
          .range(a, b),
      "kills",
    ),
    paged(
      (a, b) =>
        ev()
          // enemy-hp-v1 needs every attacker's hits on the round's victims (health left);
          // read server-side only, never returned in the report.
          .select(`${base}, damage, health_after:data->health_after`)
          .eq("match_id", matchId)
          .eq("event_type", "damage")
          .order("tick")
          .range(a, b),
      "damage",
    ),
    paged(
      (a, b) =>
        ev()
          .select(base)
          .eq("match_id", matchId)
          .in("event_type", Object.keys(OBJECTIVE))
          .order("tick")
          .range(a, b),
      "objectives",
    ),
    paged(
      (a, b) =>
        ev()
          .select(`${base}, money_spent:data->money_spent, disconnected:data->disconnected`)
          .eq("match_id", matchId)
          .eq("event_type", "round_end")
          .order("tick")
          .range(a, b),
      "round_ends",
    ),
  ]);
  const failed = rounds.error ?? roundPlayers.error;
  if (failed) throw new Error(`ROUNDS_READ_FAILED:${failed.code ?? "unknown"}`);
  const roundEnds = ends
    .filter((e) => num(e.round_number) !== null)
    .map((e) => ({
      roundNumber: e.round_number as number,
      moneySpent: numberMap(e.money_spent),
      disconnected: numberMap(e.disconnected),
    }));
  return {
    participantKey,
    spendRecorded: roundEnds.some((e) => e.moneySpent !== null),
    input: {
      matchId,
      rounds: (rounds.data ?? []).map((r) => ({
        roundNumber: r.round_number,
        startTick: num(r.start_tick),
        endTick: num(r.end_tick),
        winnerSide: determinedWinnerSide(r),
        winReason: r.win_reason,
      })),
      roundPlayers: (roundPlayers.data ?? []).map((p) => ({
        roundNumber: p.round_number,
        participantKey: p.participant_key,
        side: asSide(p.side),
        moneyStart: num(p.money_start),
        equipmentStart: num(p.equipment_value),
      })),
      kills: kills.map((k) => ({
        id: k.id,
        roundNumber: num(k.round_number),
        tick: num(k.tick),
        timeSeconds: num(k.time_seconds),
        actor: k.actor_steam_id,
        victim: k.victim_steam_id,
        assister: k.assister_steam_id ?? null,
        weapon: k.weapon ?? null,
        headshot: typeof k.headshot === "boolean" ? k.headshot : null,
      })),
      damage: damage.map((d) => ({
        id: d.id,
        roundNumber: num(d.round_number),
        tick: num(d.tick),
        actor: d.actor_steam_id,
        victim: d.victim_steam_id,
        damage: num(d.damage),
        healthAfter: num(d.health_after),
      })),
      objectives: objectives
        .filter((o) => OBJECTIVE[o.event_type])
        .map((o) => ({
          roundNumber: num(o.round_number),
          tick: num(o.tick),
          type: OBJECTIVE[o.event_type]!,
          actor: o.actor_steam_id,
        })),
      roundEnds,
    },
  };
}

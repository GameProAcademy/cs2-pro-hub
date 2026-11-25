/**
 * PM3 / Fase 4.2.5 — duels & aim read (`cs2.duels.v1`), module C.
 *
 * Same security model as the death review (PM2): every query runs with the signed-in player's own
 * Supabase session (`requireSupabaseAuth`), never the service role; a match id outside the caller's
 * own overview is never queried (IDOR → NOT_FOUND, identical to a match that does not exist). The
 * caller's participant comes from `match_participants`. Only the caller's own damage and shots are
 * read, plus every kill of the match (needed for the round's opening kill); the response carries no
 * other player's identity — duels reference only round and tick.
 */
import { determinedWinnerSide } from "@/lib/rounds/winnerEvidence";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCombatReport,
  type CombatEventRow,
  type CombatInput,
  type CombatReport,
} from "@/lib/combat/duels";
import type { Side } from "@/lib/diagnosis/deathContext";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import type { OverviewMatch } from "@/lib/playerOverview";
import { ownParticipantKeys } from "@/lib/xray.functions";

export const combatInput = z.object({ matchId: z.string().uuid().optional() }).strict();
/** Matches listed in the selector (newest first). */
export const COMBAT_MAX_MATCHES = 50;
/** Rows read per query page; every list is paged until exhausted, up to ROW_CAP. */
const PAGE = 1000;
/** A CS2 match never gets near this many own rows; hitting it fails loudly instead of truncating. */
export const COMBAT_ROW_CAP = 20000;

export interface CombatMatchOption {
  matchId: string;
  map: string | null;
  playedAt: string;
  dateSource: OverviewMatch["dateSource"];
}

export type CombatResponse = { matches: CombatMatchOption[] } & (
  | { status: "EMPTY" }
  | { status: "NOT_FOUND" }
  | { status: "NO_PARTICIPANT"; matchId: string }
  | {
      status: "OK";
      matchId: string;
      map: string | null;
      telemetry: { shotsAttributed: boolean; hitGroupsRecorded: boolean };
      report: CombatReport;
    }
);

export const getMatchCombat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => combatInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<CombatResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const own = [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, COMBAT_MAX_MATCHES);
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
    const loaded = await loadCombatInput(context.supabase, context.userId, match.matchId);
    if (!loaded) return { matches, status: "NO_PARTICIPANT", matchId: match.matchId };
    const report = buildCombatReport(loaded.input, loaded.participantKey);
    console.info(
      JSON.stringify({
        event: "combat_report",
        version: report.version,
        duels: report.duels.length,
        shots: report.shooting.byWeapon.reduce((s, w) => s + w.shots, 0),
        shotsAttributed: loaded.input.shotsAttributed,
        hitGroupsRecorded: loaded.input.hitGroupsRecorded,
        excluded: report.excluded,
      }),
    );
    return {
      matches,
      status: "OK",
      matchId: match.matchId,
      map: match.map,
      telemetry: {
        shotsAttributed: loaded.input.shotsAttributed,
        hitGroupsRecorded: loaded.input.hitGroupsRecorded,
      },
      report,
    };
  });

/** Participant keys are SteamID64 or the parser's opaque key; anything else is refused. */
const SAFE_KEY = /^[A-Za-z0-9:_.-]{1,64}$/;

type Row = {
  id: string;
  round_number: number | null;
  tick: number | null;
  time_seconds: number | null;
  actor_steam_id: string | null;
  victim_steam_id: string | null;
  weapon: string | null;
  headshot?: boolean | null;
  distance?: number | null;
  damage?: number | null;
  hitgroup?: string | null;
};

async function paged(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
  label: string,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`COMBAT_READ_FAILED:${label}:${error.code ?? "unknown"}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    if (out.length >= COMBAT_ROW_CAP) throw new Error(`COMBAT_ROW_CAP:${label}`);
  }
}

export function toCombatRow(type: CombatEventRow["type"], r: Row): CombatEventRow {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: r.id,
    type,
    roundNumber: num(r.round_number),
    tick: num(r.tick),
    timeSeconds: num(r.time_seconds),
    actor: r.actor_steam_id ?? null,
    victim: r.victim_steam_id ?? null,
    weapon: r.weapon ?? null,
    headshot: typeof r.headshot === "boolean" ? r.headshot : null,
    distance: num(r.distance),
    damage: num(r.damage),
    hitgroup: typeof r.hitgroup === "string" ? r.hitgroup : null,
  };
}

const asSide = (v: string | null): Side | null => (v === "T" || v === "CT" ? v : null);

export async function loadCombatInput(
  supabase: SupabaseClient<Database>,
  userId: string,
  matchId: string,
): Promise<{ participantKey: string; input: CombatInput } | null> {
  const playerIds = await ownPlayerIds(supabase, userId, "COMBAT");
  if (!playerIds.length) return null;
  const keys = await ownParticipantKeys(supabase, playerIds, [matchId]);
  const participantKey = keys.get(matchId);
  if (!participantKey || !SAFE_KEY.test(participantKey)) return null;
  const base = "id, round_number, tick, time_seconds, actor_steam_id, victim_steam_id, weapon";
  const events = () => supabase.from("round_events");
  const [rounds, roundPlayers, kills, damage, shots, shotProbe, groupProbe] = await Promise.all([
    supabase
      .from("match_rounds")
      .select("round_number, start_tick, end_tick, winner_side, win_reason, metadata")
      .eq("match_id", matchId),
    supabase
      .from("round_players")
      .select("round_number, participant_key, side")
      .eq("match_id", matchId),
    paged(
      (a, b) =>
        events()
          .select(`${base}, headshot, distance, hitgroup:data->>hitgroup`)
          .eq("match_id", matchId)
          .eq("event_type", "kill")
          .order("tick")
          .range(a, b),
      "kills",
    ),
    paged(
      (a, b) =>
        events()
          .select(`${base}, damage, hitgroup:data->>hitgroup`)
          .eq("match_id", matchId)
          .eq("event_type", "damage")
          .or(`actor_steam_id.eq.${participantKey},victim_steam_id.eq.${participantKey}`)
          .order("tick")
          .range(a, b),
      "damage",
    ),
    paged(
      (a, b) =>
        events()
          .select(base)
          .eq("match_id", matchId)
          .eq("event_type", "weapon_fire")
          .eq("actor_steam_id", participantKey)
          .order("tick")
          .range(a, b),
      "shots",
    ),
    events()
      .select("id")
      .eq("match_id", matchId)
      .eq("event_type", "weapon_fire")
      .not("actor_steam_id", "is", null)
      .limit(1),
    events()
      .select("id")
      .eq("match_id", matchId)
      .eq("event_type", "damage")
      .not("data->>hitgroup", "is", null)
      .limit(1),
  ]);
  const failed = rounds.error ?? roundPlayers.error ?? shotProbe.error ?? groupProbe.error;
  if (failed) throw new Error(`COMBAT_READ_FAILED:${failed.code ?? "unknown"}`);
  return {
    participantKey,
    input: {
      matchId,
      rounds: (rounds.data ?? []).map((r) => ({
        roundNumber: r.round_number,
        startTick: r.start_tick,
        endTick: r.end_tick,
        winnerSide: determinedWinnerSide(r),
        winReason: r.win_reason,
      })),
      roundPlayers: (roundPlayers.data ?? []).map((p) => ({
        roundNumber: p.round_number,
        participantKey: p.participant_key,
        side: asSide(p.side),
      })),
      events: [
        ...kills.map((r) => toCombatRow("kill", r)),
        ...damage.map((r) => toCombatRow("damage", r)),
        ...shots.map((r) => toCombatRow("weapon_fire", r)),
      ],
      shotsAttributed: (shotProbe.data ?? []).length > 0,
      hitGroupsRecorded: (groupProbe.data ?? []).length > 0,
    },
  };
}

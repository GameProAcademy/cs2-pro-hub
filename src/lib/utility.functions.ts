/**
 * PM3 / Fase 4.2.6 — utility read (`cs2.utility.v1`), module D.
 *
 * Same security model as the duels and death review: every query runs with the signed-in player's
 * own Supabase session (`requireSupabaseAuth`, RLS), never the service role; a match id outside the
 * caller's own overview is never queried (IDOR → NOT_FOUND, identical to a match that does not
 * exist). Only the caller's own grenade events are read, plus the match's kills and plants (round
 * phases) and four existence probes; the response carries no other player's identity.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { Side } from "@/lib/diagnosis/deathContext";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import type { OverviewMatch } from "@/lib/playerOverview";
import {
  buildUtilityReport,
  type UtilityEventRow,
  type UtilityInput,
  type UtilityReport,
} from "@/lib/utility/utility";
import { ownParticipantKeys } from "@/lib/xray.functions";

export const utilityInput = z.object({ matchId: z.string().uuid().optional() }).strict();
export const UTILITY_MAX_MATCHES = 50;
const PAGE = 1000;
export const UTILITY_ROW_CAP = 20000;
const SAFE_KEY = /^[A-Za-z0-9:_.-]{1,64}$/;

const DETONATION_TYPES = ["flash", "he", "smoke", "incendiary", "molotov"] as const;
const UTILITY_DAMAGE_WEAPONS = ["hegrenade", "inferno", "molotov", "incgrenade"];
const GRENADE_THROWS = ["flashbang", "hegrenade", "smokegrenade", "molotov", "incgrenade", "decoy"];

export interface UtilityMatchOption {
  matchId: string;
  map: string | null;
  playedAt: string;
  dateSource: OverviewMatch["dateSource"];
}

export type UtilityTelemetry = Pick<
  UtilityInput,
  "throwsAttributed" | "blindsRecorded" | "detonationsAttributed" | "fireRecorded"
>;

export type UtilityResponse = { matches: UtilityMatchOption[] } & (
  | { status: "EMPTY" }
  | { status: "NOT_FOUND" }
  | { status: "NO_PARTICIPANT"; matchId: string }
  | {
      status: "OK";
      matchId: string;
      map: string | null;
      telemetry: UtilityTelemetry;
      report: UtilityReport;
    }
);

export const getMatchUtility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => utilityInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<UtilityResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const own = [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, UTILITY_MAX_MATCHES);
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
    const loaded = await loadUtilityInput(context.supabase, context.userId, match);
    if (!loaded) return { matches, status: "NO_PARTICIPANT", matchId: match.matchId };
    const report = buildUtilityReport(loaded.input, loaded.participantKey);
    const { throwsAttributed, blindsRecorded, detonationsAttributed, fireRecorded } = loaded.input;
    console.info(
      JSON.stringify({
        event: "utility_report",
        version: report.version,
        flashes: report.flashes.length,
        throwsAttributed,
        blindsRecorded,
        detonationsAttributed,
        fireRecorded,
      }),
    );
    return {
      matches,
      status: "OK",
      matchId: match.matchId,
      map: match.map,
      telemetry: { throwsAttributed, blindsRecorded, detonationsAttributed, fireRecorded },
      report,
    };
  });

type Row = {
  id: string;
  event_type: string;
  round_number: number | null;
  tick: number | null;
  actor_steam_id: string | null;
  victim_steam_id: string | null;
  weapon: string | null;
  damage?: number | null;
  flash_duration?: string | number | null;
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
    if (error) throw new Error(`UTILITY_READ_FAILED:${label}:${error.code ?? "unknown"}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    if (out.length >= UTILITY_ROW_CAP) throw new Error(`UTILITY_ROW_CAP:${label}`);
  }
}

const KNOWN_TYPES = new Set<string>([
  ...DETONATION_TYPES,
  "damage",
  "kill",
  "weapon_fire",
  "bomb_plant",
]);

export function toUtilityRow(r: Row): UtilityEventRow | null {
  if (!KNOWN_TYPES.has(r.event_type)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // data->>flash_duration arrives as text; a non-numeric or absent value stays null.
  const fd =
    typeof r.flash_duration === "string" && r.flash_duration.trim() !== ""
      ? Number(r.flash_duration)
      : r.flash_duration;
  return {
    id: r.id,
    type: r.event_type as UtilityEventRow["type"],
    roundNumber: num(r.round_number),
    tick: num(r.tick),
    actor: r.actor_steam_id ?? null,
    victim: r.victim_steam_id ?? null,
    weapon: r.weapon ?? null,
    damage: num(r.damage),
    flashDuration: num(fd),
  };
}

const asSide = (v: string | null): Side | null => (v === "T" || v === "CT" ? v : null);

async function loadUtilityInput(
  supabase: SupabaseClient<Database>,
  userId: string,
  match: OverviewMatch,
): Promise<{ participantKey: string; input: UtilityInput } | null> {
  const matchId = match.matchId;
  const playerIds = await ownPlayerIds(supabase, userId, "UTILITY");
  if (!playerIds.length) return null;
  const keys = await ownParticipantKeys(supabase, playerIds, [matchId]);
  const participantKey = keys.get(matchId);
  if (!participantKey || !SAFE_KEY.test(participantKey)) return null;
  const base = "id, event_type, round_number, tick, actor_steam_id, victim_steam_id, weapon";
  const ev = () => supabase.from("round_events");
  const exists = (q: PromiseLike<{ data: unknown; error: { code?: string } | null }>) => q;
  const [rounds, roundPlayers, grenades, utilityHits, throws, phases, ...probes] =
    await Promise.all([
      supabase
        .from("match_rounds")
        .select("round_number, start_tick, end_tick, winner_side, win_reason")
        .eq("match_id", matchId),
      supabase
        .from("round_players")
        .select("round_number, participant_key, side")
        .eq("match_id", matchId),
      paged(
        (a, b) =>
          ev()
            .select(`${base}, flash_duration:data->>flash_duration`)
            .eq("match_id", matchId)
            .eq("actor_steam_id", participantKey)
            .in("event_type", [...DETONATION_TYPES])
            .order("tick")
            .range(a, b),
        "grenades",
      ),
      paged(
        (a, b) =>
          ev()
            .select(`${base}, damage`)
            .eq("match_id", matchId)
            .eq("actor_steam_id", participantKey)
            .in("event_type", ["damage", "kill"])
            .in("weapon", UTILITY_DAMAGE_WEAPONS)
            .order("tick")
            .range(a, b),
        "utility_hits",
      ),
      paged(
        (a, b) =>
          ev()
            .select(base)
            .eq("match_id", matchId)
            .eq("actor_steam_id", participantKey)
            .eq("event_type", "weapon_fire")
            .in("weapon", GRENADE_THROWS)
            .order("tick")
            .range(a, b),
        "throws",
      ),
      paged(
        (a, b) =>
          ev()
            .select(base)
            .eq("match_id", matchId)
            .in("event_type", ["kill", "bomb_plant"])
            .order("tick")
            .range(a, b),
        "phases",
      ),
      // Existence probes (one row each): what this match recorded at all.
      exists(
        ev()
          .select("id")
          .eq("match_id", matchId)
          .eq("event_type", "weapon_fire")
          .not("actor_steam_id", "is", null)
          .limit(1),
      ),
      exists(
        ev()
          .select("id")
          .eq("match_id", matchId)
          .eq("event_type", "flash")
          .not("victim_steam_id", "is", null)
          .limit(1),
      ),
      exists(
        ev()
          .select("id")
          .eq("match_id", matchId)
          .in("event_type", ["flash", "he", "smoke"])
          .is("victim_steam_id", null)
          .not("actor_steam_id", "is", null)
          .limit(1),
      ),
      exists(ev().select("id").eq("match_id", matchId).eq("event_type", "incendiary").limit(1)),
    ]);
  const failed = rounds.error ?? roundPlayers.error ?? probes.find((p) => p.error)?.error;
  if (failed) throw new Error(`UTILITY_READ_FAILED:${failed.code ?? "unknown"}`);
  const has = (i: number) => ((probes[i]!.data as unknown[] | null) ?? []).length > 0;
  const throwsAttributed = has(0);
  const rows = [...grenades, ...utilityHits, ...throws, ...phases]
    .map(toUtilityRow)
    .filter((r): r is UtilityEventRow => r !== null);
  return {
    participantKey,
    input: {
      matchId,
      rounds: (rounds.data ?? []).map((r) => ({
        roundNumber: r.round_number,
        startTick: r.start_tick,
        endTick: r.end_tick,
        winnerSide: asSide(r.winner_side),
        winReason: r.win_reason,
      })),
      roundPlayers: (roundPlayers.data ?? []).map((p) => ({
        roundNumber: p.round_number,
        participantKey: p.participant_key,
        side: asSide(p.side),
      })),
      // The caller's kills appear in both the utility and phase reads: keep each row once.
      events: [...new Map(rows.map((r) => [r.id, r])).values()],
      throwsAttributed,
      blindsRecorded: has(1),
      detonationsAttributed: has(2),
      // Fire starts are emitted from R5.8.30 on; a R5.8.30 match (throws attributed) with no fire
      // simply had none.
      fireRecorded: has(3) || throwsAttributed,
      flashAssists: match.flashAssists,
      flashAssistMethod: match.flashAssistMethod ?? null,
    },
  };
}

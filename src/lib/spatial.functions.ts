/**
 * PM1 / 4.2.2 — spatial heatmap read (`spatial-heatmap-v1`).
 *
 * Read-only and RLS-scoped: every query runs with the signed-in player's own Supabase session
 * (`requireSupabaseAuth`); the service role is never used and nothing is written. Matches come
 * from the caller's own overview (quarantined matches already excluded); the caller's own
 * participant in each match comes from `match_participants` (RLS `owns_canonical_match`). Only the
 * caller's own kill events (actor or victim) are read, per match, with only the two position
 * fields of `data` — never a full tick stream. Filters are validated here, on the server; a match
 * id that is not the caller's is simply never queried.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import { buildMatchRounds } from "@/lib/roundContext";
import {
  buildHeatmap,
  MEASURED_LAYERS,
  type HeatmapEventRow,
  type HeatmapMatchInput,
  type HeatmapResult,
} from "@/lib/spatial/heatmap";
import { mapSupport, normalizeMapName, type MapSupport } from "@/lib/spatial/maps";
import { ownParticipantKeys } from "@/lib/xray.functions";

/** Own kill events read per match; a match never has this many own kills + deaths. */
export const SPATIAL_EVENTS_PER_MATCH_LIMIT = 1000;
/** Matches aggregated in one request (newest first). */
export const SPATIAL_MAX_MATCHES = 50;

export const spatialHeatmapInput = z
  .object({
    map: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional(),
    layer: z.enum(MEASURED_LAYERS).default("DEATHS"),
    side: z.enum(["ALL", "CT", "T"]).default("ALL"),
    level: z.enum(["default", "lower"]).default("default"),
    matchId: z.string().uuid().optional(),
    weapon: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/)
      .optional(),
  })
  .strict();
export type SpatialHeatmapInput = z.input<typeof spatialHeatmapInput>;

export interface SpatialMapOption {
  map: string;
  support: MapSupport["status"];
  matches: number;
}
export interface SpatialMatchOption {
  matchId: string;
  playedAt: string;
  dateSource: "played" | "processed";
}
export interface SpatialHeatmapResponse {
  /** Maps of the caller's own matches, with transform support. */
  maps: SpatialMapOption[];
  /** The caller's own matches on the selected map (newest first). */
  matches: SpatialMatchOption[];
  /** null when the caller has no match at all. */
  heatmap: HeatmapResult | null;
}

export const getSpatialHeatmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => spatialHeatmapInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<SpatialHeatmapResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const own = overview.matches;
    const maps = mapOptions(own);
    if (!own.length) return { maps, matches: [], heatmap: null };
    const map = data.map ?? defaultMap(maps);
    const onMap = own
      .filter((m) => normalizeMapName(m.map) === map)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, SPATIAL_MAX_MATCHES);
    const matches = onMap.map((m) => ({
      matchId: m.matchId,
      playedAt: m.playedAt,
      dateSource: m.dateSource,
    }));
    // A match id outside the caller's own matches on this map is never queried.
    const selected = data.matchId ? onMap.filter((m) => m.matchId === data.matchId) : onMap;
    const inputs =
      mapSupport(map).status === "SUPPORTED" && selected.length
        ? await loadHeatmapInputs(context.supabase, context.userId, selected)
        : [];
    const heatmap = buildHeatmap(inputs, {
      map,
      layer: data.layer,
      side: data.side,
      level: data.level,
      matchIds: selected.map((m) => m.matchId),
      ...(data.weapon ? { weapon: data.weapon } : {}),
    });
    // Structured, technical only: no user id, match id or coordinates.
    console.info(
      JSON.stringify({
        event: "spatial_heatmap",
        version: heatmap.version,
        map,
        support: heatmap.support,
        layer: data.layer,
        side: data.side,
        matches: selected.length,
        status: heatmap.events.status,
        eligible: heatmap.events.coverage?.eligible ?? heatmap.events.sample_size?.n ?? 0,
        plotted: heatmap.events.value,
        excluded: heatmap.excluded,
      }),
    );
    return { maps, matches, heatmap };
  });

/** Pure: maps of the caller's matches, supported first, then by number of matches. */
export function mapOptions(matches: Array<{ map: string | null }>): SpatialMapOption[] {
  const count = new Map<string, number>();
  for (const m of matches) {
    const name = normalizeMapName(m.map);
    if (name) count.set(name, (count.get(name) ?? 0) + 1);
  }
  const rank = { SUPPORTED: 0, NOT_VALIDATED: 1, UNKNOWN_MAP: 2 } as const;
  return [...count]
    .map(([map, n]) => ({ map, support: mapSupport(map).status, matches: n }))
    .sort(
      (a, b) =>
        rank[a.support] - rank[b.support] || b.matches - a.matches || a.map.localeCompare(b.map),
    );
}

/** Pure: the default map — the first supported one, else the most played. */
export function defaultMap(maps: SpatialMapOption[]): string {
  return maps[0]?.map ?? "de_dust2";
}

/**
 * The caller's own participant, side per round and own kill events for each match. RLS:
 * `match_participants`, `round_players` and `round_events` are all gated by
 * `owns_canonical_match`; the explicit participant filter keeps a shared canonical match (D19)
 * from exposing another player's events.
 */
async function loadHeatmapInputs(
  supabase: SupabaseClient<Database>,
  userId: string,
  matches: Array<{ matchId: string; map: string | null }>,
): Promise<HeatmapMatchInput[]> {
  const playerIds = await ownPlayerIds(supabase, userId, "SPATIAL");
  if (!playerIds.length) return [];
  const keys = await ownParticipantKeys(
    supabase,
    playerIds,
    matches.map((m) => m.matchId),
  );
  const mapOf = new Map(matches.map((m) => [m.matchId, m.map]));
  return Promise.all(
    [...keys].map(async ([matchId, participantKey]) => {
      const [roundPlayers, events] = await Promise.all([
        supabase
          .from("round_players")
          .select("round_number, participant_key, side")
          .eq("match_id", matchId)
          .eq("participant_key", participantKey),
        supabase
          .from("round_events")
          .select(
            "id, round_number, tick, event_type, actor_steam_id, victim_steam_id, weapon, headshot, position:data->position, victim_position:data->victim_position",
          )
          .eq("match_id", matchId)
          .eq("event_type", "kill")
          .or(`actor_steam_id.eq.${participantKey},victim_steam_id.eq.${participantKey}`)
          .limit(SPATIAL_EVENTS_PER_MATCH_LIMIT),
      ]);
      const failed = roundPlayers.error ?? events.error;
      if (failed) throw new Error(`SPATIAL_READ_FAILED:${failed.code ?? "unknown"}`);
      const rows = (events.data ?? []) as unknown as SpatialEventRow[];
      // Never silently partial: a match that hits the read limit fails loudly.
      if (rows.length >= SPATIAL_EVENTS_PER_MATCH_LIMIT) throw new Error("SPATIAL_EVENTS_LIMIT");
      const { rounds } = buildMatchRounds({
        matchId,
        participantKey,
        rounds: [],
        roundPlayers: roundPlayers.data ?? [],
        events: [],
      });
      return {
        matchId,
        map: mapOf.get(matchId) ?? null,
        participantKey,
        rounds,
        events: rows.map(toHeatmapEvent(matchId)),
      };
    }),
  );
}

export interface SpatialEventRow {
  id: string;
  round_number: number | null;
  tick: number | null;
  event_type: string;
  actor_steam_id: string | null;
  victim_steam_id: string | null;
  weapon: string | null;
  headshot: boolean | null;
  position: unknown;
  victim_position: unknown;
}

/** Pure: a selected `round_events` row as heatmap input (absent positions stay absent). */
export const toHeatmapEvent =
  (matchId: string) =>
  (r: SpatialEventRow): HeatmapEventRow => ({
    id: r.id,
    matchId,
    round: r.round_number,
    tick: r.tick,
    type: r.event_type,
    actor: r.actor_steam_id,
    victim: r.victim_steam_id,
    weapon: r.weapon,
    headshot: r.headshot,
    data: {
      ...(r.position == null ? {} : { position: r.position }),
      ...(r.victim_position == null ? {} : { victim_position: r.victim_position }),
    },
  });

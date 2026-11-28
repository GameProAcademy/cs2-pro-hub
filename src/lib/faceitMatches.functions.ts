/**
 * VGL 5.0/5.1 — the signed-in player's native FACEIT matches (read-only, under RLS).
 *
 * Native = `matches.data_source = 'faceit'`: what FACEIT itself reported (map, score, result
 * and, when FACEIT published them, per-player stats). VGL 5.1: they are listed in My Matches
 * with a source tag and enter the aggregates ONLY through the per-metric source policy
 * (`METRIC_SOURCE_POLICY`: K/D, ADR, HS%, KAST when reported, win rate; never the rating);
 * CS2 PRO Score, Player DNA and Best Map stay demo-only. A FACEIT match the resolver linked to
 * an uploaded demo is shown once, from the demo.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FACEIT_MATCHES_LIMIT = 20;

export interface FaceitNativeMatch {
  /** Internal canonical match id (the caller's own match; opens its Match Room). */
  matchId: string;
  externalMatchId: string | null;
  map: string | null;
  playedAt: string | null;
  result: "win" | "loss" | "draw" | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  rounds: number | null;
  complete: boolean;
  kills: number | null;
  deaths: number | null;
  adr: number | null;
  kast: number | null;
  hsPercent: number | null;
}

export interface FaceitMatchesView {
  source: "faceit";
  matches: FaceitNativeMatch[];
  total: number;
  linkedToDemo: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function resultOf(v: unknown): FaceitNativeMatch["result"] {
  return v === "win" || v === "loss" || v === "draw" ? v : null;
}

export const getFaceitMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FaceitMatchesView> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const empty: FaceitMatchesView = { source: "faceit", matches: [], total: 0, linkedToDemo: 0 };
    const { data: players } = await db
      .from("player_profiles")
      .select("id")
      .eq("user_id", context.userId);
    const playerIds: string[] = (players ?? []).map((p: { id: string }) => p.id);
    if (!playerIds.length) return empty;

    const [native, linked] = await Promise.all([
      db
        .from("matches")
        .select(
          "id, external_match_id, map, played_at, match_date, result, score_player, score_opponent, rounds, round_count, source_complete",
          { count: "exact" },
        )
        .in("player_id", playerIds)
        .eq("data_source", "faceit")
        .order("played_at", { ascending: false, nullsFirst: false })
        .limit(FACEIT_MATCHES_LIMIT),
      db
        .from("match_sources")
        .select("match_id, matches!inner(player_id, data_source)", { count: "exact", head: true })
        .eq("source", "faceit")
        .in("matches.player_id", playerIds)
        .eq("matches.data_source", "demo"),
    ]);
    if (native.error) throw new Error("FACEIT_MATCHES_FAILED");
    const rows = (native.data ?? []) as Array<Record<string, unknown>>;
    const ids = rows.map((r) => r["id"] as string);
    const metrics = new Map<string, Record<string, unknown>>();
    if (ids.length) {
      const { data } = await db
        .from("match_metrics")
        .select("match_id, kills, deaths, adr, kast, hs_percent")
        .in("match_id", ids)
        .in("player_id", playerIds);
      for (const m of (data ?? []) as Array<Record<string, unknown>>)
        metrics.set(m["match_id"] as string, m);
    }
    return {
      source: "faceit",
      total: native.count ?? rows.length,
      linkedToDemo: linked.error ? 0 : (linked.count ?? 0),
      matches: rows.map((r) => {
        const m = metrics.get(r["id"] as string) ?? {};
        return {
          matchId: r["id"] as string,
          externalMatchId: (r["external_match_id"] as string | null) ?? null,
          map: (r["map"] as string | null) ?? null,
          playedAt: ((r["played_at"] ?? r["match_date"]) as string | null) ?? null,
          result: resultOf(r["result"]),
          scorePlayer: num(r["score_player"]),
          scoreOpponent: num(r["score_opponent"]),
          rounds: num(r["round_count"]) ?? num(r["rounds"]),
          complete: r["source_complete"] === true,
          kills: num(m["kills"]),
          deaths: num(m["deaths"]),
          adr: num(m["adr"]),
          kast: num(m["kast"]),
          hsPercent: num(m["hs_percent"]),
        };
      }),
    };
  });

/** VGL 5.1 — the FACEIT Match Room: only what FACEIT reported, never simulated demo data. */
export interface FaceitMatchRoomView {
  state: "OK" | "NOT_FOUND";
  source: "faceit";
  externalMatchId: string | null;
  /** https://*.faceit.com only (validated); null when FACEIT did not give one. */
  faceitUrl: string | null;
  competition: string | null;
  region: string | null;
  syncedAt: string | null;
  complete: boolean;
  teamPlayer: string | null;
  teamOpponent: string | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  rounds: number | null;
  stats: {
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    adr: number | null;
    hsPercent: number | null;
    kast: number | null;
  } | null;
}

const NOT_FOUND_ROOM: FaceitMatchRoomView = {
  state: "NOT_FOUND",
  source: "faceit",
  externalMatchId: null,
  faceitUrl: null,
  competition: null,
  region: null,
  syncedAt: null,
  complete: false,
  teamPlayer: null,
  teamOpponent: null,
  scorePlayer: null,
  scoreOpponent: null,
  rounds: null,
  stats: null,
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Only an https FACEIT host is ever turned into a link. */
export function safeFaceitUrl(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  try {
    const url = new URL(s.replace("{lang}", "en"));
    return url.protocol === "https:" && /(^|\.)faceit\.com$/i.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export const getFaceitMatchRoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { matchId?: unknown } | null)?.matchId;
    return {
      matchId: typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null,
    };
  })
  .handler(async ({ context, data }): Promise<FaceitMatchRoomView> => {
    if (!data.matchId) return NOT_FOUND_ROOM;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data: players } = await db
      .from("player_profiles")
      .select("id")
      .eq("user_id", context.userId);
    const playerIds: string[] = (players ?? []).map((p: { id: string }) => p.id);
    if (!playerIds.length) return NOT_FOUND_ROOM;
    const { data: m } = await db
      .from("matches")
      .select(
        "id, external_match_id, team_player, team_opponent, score_player, score_opponent, rounds, round_count, source_complete, source_fetched_at, source_metadata",
      )
      .eq("id", data.matchId)
      .in("player_id", playerIds)
      .eq("data_source", "faceit")
      .maybeSingle();
    if (!m) return NOT_FOUND_ROOM;
    const { data: metric } = await db
      .from("match_metrics")
      .select("kills, deaths, assists, adr, hs_percent, kast")
      .eq("match_id", m.id)
      .in("player_id", playerIds)
      .maybeSingle();
    const meta = (m.source_metadata ?? {}) as Record<string, unknown>;
    return {
      state: "OK",
      source: "faceit",
      externalMatchId: str(m.external_match_id),
      faceitUrl: safeFaceitUrl(meta["faceit_url"]),
      competition: str(meta["competition"]),
      region: str(meta["region"]),
      syncedAt: str(m.source_fetched_at),
      complete: m.source_complete === true,
      teamPlayer: str(m.team_player),
      teamOpponent: str(m.team_opponent),
      scorePlayer: num(m.score_player),
      scoreOpponent: num(m.score_opponent),
      rounds: num(m.round_count) ?? num(m.rounds),
      stats: metric
        ? {
            kills: num(metric.kills),
            deaths: num(metric.deaths),
            assists: num(metric.assists),
            adr: num(metric.adr),
            hsPercent: num(metric.hs_percent),
            kast: num(metric.kast),
          }
        : null,
    };
  });

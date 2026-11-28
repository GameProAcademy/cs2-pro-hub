/**
 * VGL 5.0 — Frente 8: the signed-in player's native FACEIT matches (read-only, under RLS).
 *
 * Native = `matches.data_source = 'faceit'`: what FACEIT itself reported (map, score, result
 * and, when FACEIT published them, per-player stats). They are labelled as FACEIT data and are
 * NOT mixed into the demo-based aggregates, CS2 PRO Score or Player DNA, which stay built from
 * parsed demos only. A FACEIT match the resolver linked to an uploaded demo is counted
 * separately: that match is shown once, from the demo.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FACEIT_MATCHES_LIMIT = 20;

export interface FaceitNativeMatch {
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

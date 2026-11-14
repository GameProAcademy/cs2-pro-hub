/**
 * PM2 4.2.4 — persists `cs2.round-trajectory.v1` after the canonical match has committed.
 *
 * Best effort by design: a failure here never fails a job whose match is already persisted (the
 * replay then reports the trajectory as unavailable). Idempotent and first-write-wins per
 * canonical match: a later upload of the same match never overwrites stored samples. Service role
 * only (the tables have no write grant for players). Logs carry no identity and no coordinates.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { RoundTrajectoriesWireV1 } from "@/lib/replay/trajectory";

export type TrajectoryPersistOutcome = "STORED" | "ALREADY_STORED" | "ABSENT" | "FAILED";

export async function persistRoundTrajectories(
  db: SupabaseClient<Database>,
  args: {
    matchId: string;
    trajectories: RoundTrajectoriesWireV1 | null | undefined;
    parserRevision: string | null;
  },
): Promise<TrajectoryPersistOutcome> {
  const t = args.trajectories;
  if (!t) return "ABSENT";
  try {
    const { data: inserted, error } = await db
      .from("match_trajectories")
      .upsert(
        {
          match_id: args.matchId,
          schema: t.schema,
          encoding: t.encoding,
          status: t.status,
          reason: t.reason,
          step_ticks: t.step_ticks,
          skipped: t.skipped,
          parser_revision: args.parserRevision,
        },
        { onConflict: "match_id", ignoreDuplicates: true },
      )
      .select("match_id");
    if (error) throw new Error(error.code ?? "unknown");
    if (!inserted?.length) return "ALREADY_STORED";
    if (t.rounds.length) {
      const { error: roundsError } = await db.from("round_trajectories").insert(
        t.rounds.map((r) => ({
          match_id: args.matchId,
          round_number: r.round,
          first_tick: r.first_tick,
          end_tick: r.end_tick,
          step_ticks: r.step_ticks,
          sample_count: r.sample_count,
          players: r.players.map((p) => ({
            participant_key: p.steam_id,
            side: p.side,
            xyz: p.xyz,
            alive: p.alive,
          })),
          dropped_players: r.dropped_players,
        })),
      );
      if (roundsError) {
        // Never leave a status row claiming samples that are not stored.
        await db.from("match_trajectories").delete().eq("match_id", args.matchId);
        throw new Error(roundsError.code ?? "unknown");
      }
    }
    console.info(
      JSON.stringify({
        event: "round_trajectories_stored",
        status: t.status,
        rounds: t.rounds.length,
        skipped: t.skipped.length,
      }),
    );
    return "STORED";
  } catch (error) {
    console.warn("[pipeline] round trajectories deferred", {
      code: error instanceof Error ? error.message.slice(0, 40) : "unknown",
    });
    return "FAILED";
  }
}

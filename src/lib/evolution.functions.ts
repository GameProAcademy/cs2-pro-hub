/**
 * PM4 / Fase 4.2.8 — evolution read (`cs2.evolution.v1`), module G.
 *
 * Same security model as every player read: the signed-in player's own Supabase session
 * (`requireSupabaseAuth`, RLS on match_metrics / matches), never the service role, never an
 * owner id from the client. The history is the caller's own overview; the computation is
 * bounded (newest EVOLUTION_MAX_MATCHES matches) and pure.
 *
 * Snapshots: no second snapshot pipeline. The per-match `match_metrics` rows are the immutable
 * per-match unit (written once by the pipeline), the Player DNA keeps its own idempotent
 * versioned snapshots (`player_dna_snapshots`, input digest), and every report carries
 * `cs2.evolution.v1` plus the method key of each metric, so a later method can be told apart.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEvolution, type EvolutionReport } from "@/lib/evolution/evolution";
import { loadPlayerOverview } from "@/lib/playerData.functions";

export const EVOLUTION_MAX_MATCHES = 100;

export const evolutionInput = z
  .object({
    window: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50)]).optional(),
    map: z
      .string()
      .regex(/^[a-z0-9_]{1,40}$/)
      .optional(),
    side: z.enum(["ALL", "CT", "T"]).optional(),
  })
  .strict();
export type EvolutionInput = z.infer<typeof evolutionInput>;

export type EvolutionResponse = { status: "EMPTY" } | { status: "OK"; report: EvolutionReport };

export const getEvolution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => evolutionInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<EvolutionResponse> => {
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const matches = [...overview.matches]
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, EVOLUTION_MAX_MATCHES);
    if (!matches.length) return { status: "EMPTY" };
    // An unknown map is simply a filter with no match (never another player's data).
    const report = buildEvolution(matches, {
      window: data.window ?? 10,
      map: data.map ?? null,
      side: data.side ?? "ALL",
    });
    console.info(
      JSON.stringify({
        event: "evolution_report",
        version: report.version,
        window: report.window,
        eligible: report.eligibleMatches,
      }),
    );
    return { status: "OK", report };
  });

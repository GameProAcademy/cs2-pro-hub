/**
 * CS2 PRO Score for the signed-in player (read-only).
 *
 * Reads exactly the rows the Player DNA reads — the caller's own `match_features` under RLS,
 * minus quarantined matches (`loadPlayerDna`) — and applies the pure `buildProScore`.
 * It never writes, takes no input, and the identity comes only from the authenticated context.
 * The Score is not persisted in this version: it is recomputed, deterministically, from the
 * persisted features (see docs/reference/PRO_SCORE.md).
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadPlayerDna } from "@/lib/playerData.functions";
import { buildProScore, type ProScore } from "@/lib/proScore";

export const getProScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProScore> => {
    const { rows } = await loadPlayerDna(context.supabase, context.userId);
    return buildProScore(rows);
  });

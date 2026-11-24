/**
 * UX-1.7 — the ONE training list (`cs2.training-priority.v2`), read only. The same rows as the
 * Player DNA v3 (`loadPlayerDna`: the caller's own match_features under the caller's session,
 * quarantined matches excluded, kills and deaths of the caller's own match_metrics).
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadPlayerDna } from "@/lib/playerData.functions";
import { computePrioritiesV2, type PriorityResultV2 } from "@/lib/training/priorityV2";

export const getTrainingPriorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PriorityResultV2> => {
    const { rows } = await loadPlayerDna(context.supabase, context.userId);
    return computePrioritiesV2(rows);
  });

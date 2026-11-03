/**
 * Meu Treinamento — personal plan (authenticated, read-only).
 *
 * Inputs are the caller's own data read with the caller's RLS session: Player DNA, the
 * Dashboard matches (maps played) and the goals declared in the profile. Catalog items come
 * from the central catalog (`catalog_*`), bounded by locale, confirmed language and the
 * plan's topics. The plan is computed on request (deterministic for the same data), so it
 * follows every new demo and every catalog change without a republish.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATALOG_LOCALES, type CatalogLocale } from "@/lib/catalog/catalogCore";
import { fetchCatalogCandidates } from "@/lib/catalog/catalogData.server";
import { loadPlayerDna, loadPlayerOverview, ownPlayerIds } from "@/lib/playerData.functions";
import { buildTrainingPlan, planTopics, type TrainingPlanModel } from "@/lib/training/trainingPlan";

export interface TrainingPlanResult {
  player: "NONE" | "AMBIGUOUS" | "OK";
  plan: TrainingPlanModel | null;
  matches: number;
  /** The catalog could not be read: the plan shows practice only (never invented links). */
  catalogUnavailable: boolean;
}

export const getTrainingPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const locale = (input as { locale?: unknown } | null)?.locale;
    return {
      locale: (CATALOG_LOCALES as readonly unknown[]).includes(locale)
        ? (locale as CatalogLocale)
        : ("pt-BR" as CatalogLocale),
    };
  })
  .handler(async ({ context, data }): Promise<TrainingPlanResult> => {
    const db = context.supabase;
    const playerIds = await ownPlayerIds(db, context.userId, "TRAINING");
    if (playerIds.length !== 1)
      return {
        player: playerIds.length ? "AMBIGUOUS" : "NONE",
        plan: null,
        matches: 0,
        catalogUnavailable: false,
      };

    const [overview, { dna }, goals] = await Promise.all([
      loadPlayerOverview(db, context.userId),
      loadPlayerDna(db, context.userId),
      db
        .from("player_profile_goals")
        .select("goal_code, is_primary")
        .eq("player_id", playerIds[0]!),
    ]);
    if (goals.error) throw new Error(`TRAINING_GOALS_READ_FAILED:${goals.error.code ?? "unknown"}`);

    const input = {
      locale: data.locale,
      dataState:
        overview.matches.length === 0
          ? ("NO_MATCHES" as const)
          : dna.state === "READY"
            ? ("READY" as const)
            : ("INSUFFICIENT_SAMPLE" as const),
      dimensions: dna.dimensions.map((d) => ({
        dimension: d.dimension,
        index: d.value === null ? null : Math.round(d.value * 100),
      })),
      goals: [...(goals.data ?? [])]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((g) => g.goal_code),
      maps: overview.matches.map((m) => m.map).filter((m): m is string => !!m),
    };

    let candidates: Awaited<ReturnType<typeof fetchCatalogCandidates>> = [];
    let catalogUnavailable = false;
    try {
      candidates = await fetchCatalogCandidates(db, data.locale, planTopics(input));
    } catch (error) {
      catalogUnavailable = true;
      console.error("[training] catalog read failed", {
        code: error instanceof Error ? (error.message.split(":")[1] ?? "unknown") : "unknown",
      });
    }
    return {
      player: "OK",
      plan: buildTrainingPlan({ ...input, candidates }),
      matches: overview.matches.length,
      catalogUnavailable,
    };
  });

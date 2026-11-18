/**
 * PM5 — monthly review draft (`cs2.monthly-review.v1`). Read-only, with the caller's own session
 * (RLS): matches, the open training plan's sessions and saved moments. It never sends anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadOpenTrainingPlan } from "@/lib/adaptiveTraining.functions";
import { loadPlayerOverview } from "@/lib/playerData.functions";
import { MONTH_PATTERN, buildMonthlyReview, type MonthlyReview } from "@/lib/review/monthlyReview";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export const monthlyReviewInput = z.object({ month: z.string().regex(MONTH_PATTERN) }).strict();

const nextMonthStart = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

export const getMonthlyReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => monthlyReviewInput.parse(input))
  .handler(async ({ context, data }): Promise<MonthlyReview> => {
    const db = context.supabase as unknown as AnyDb;
    const [overview, plan, moments] = await Promise.all([
      loadPlayerOverview(context.supabase, context.userId),
      loadOpenTrainingPlan(db).catch(() => null),
      db
        .from("moment_bookmarks")
        .select("created_at")
        .gte("created_at", `${data.month}-01`)
        .lt("created_at", nextMonthStart(data.month))
        .limit(2000),
    ]);
    if (moments.error)
      throw new Error(`REVIEW_MOMENTS_READ_FAILED:${moments.error.code ?? "unknown"}`);
    return buildMonthlyReview({
      month: data.month,
      matches: overview.matches,
      sessions: plan ? plan.sessions : null,
      momentsCreatedAt: (moments.data ?? []).map((r) => r.created_at as string),
      today: new Date().toISOString().slice(0, 10),
    });
  });

/**
 * Scheduled pipeline maintenance and THE FACEIT QUEUE WORKER (external caller:
 * cron).
 *
 * Bearer-secret authenticated with the existing Lovable cron helper or the
 * database-backed scheduler secret used by native pg_cron. It:
 *  - re-queues demo jobs stuck in `processing` past the stale window;
 *  - reports that DEM deletion is disabled during the G.6-R safety closure;
 *  - advances at most one queued demo job (concurrency-limited) when the
 *    parser preflight gate is fully ready;
 *  - runs the FACEIT worker: stale recovery, atomic claim, execution and state
 *    transition, within an explicit time budget so the handler always returns
 *    before the runtime timeout instead of being killed mid-job.
 *
 * A single invocation never loops indefinitely and never swallows a failure
 * silently: every outcome is reported in the response. No PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";

import { authenticatePipelineCronRequest } from "@/integrations/supabase/pipeline-cron-auth.server";

/** Wall-clock budget for the FACEIT part of this invocation. */
const FACEIT_WORKER_BUDGET_MS = 20_000;

export const Route = createFileRoute("/api/public/pipeline-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticatePipelineCronRequest(request);
        if (unauthorized) return unauthorized;

        const {
          reconcileDurableDemoQueue,
          reconcileOrphanDemoUploads,
          recoverStaleJobs,
        } = await import("@/lib/pipeline/jobs.server");
        const { runFaceitSyncWorker } = await import("@/lib/faceit/faceit.sync.server");

        const [recovered, reconciled, orphansReconciled] = await Promise.all([
          recoverStaleJobs(),
          reconcileDurableDemoQueue(25),
          reconcileOrphanDemoUploads(15, 25),
        ]);

        // FACEIT synchronisation shares the scheduler but not the demo queue.
        let faceit: {
          recovered: number;
          processed: { status: string; errorCode: string | null }[];
          budgetReached: boolean;
          error?: string;
        };
        try {
          const result = await runFaceitSyncWorker({ timeBudgetMs: FACEIT_WORKER_BUDGET_MS });
          faceit = {
            recovered: result.recovered,
            processed: result.processed.map((outcome) => ({
              status: outcome.status,
              errorCode: outcome.errorCode ?? null,
            })),
            budgetReached: result.budgetReached,
          };
        } catch (error) {
          const code = error instanceof Error ? error.name : "unknown_error";
          console.error(`[cron] faceit_worker_error code=${code}`);
          faceit = { recovered: 0, processed: [], budgetReached: false, error: "worker_error" };
        }

        return Response.json({
          demoDispatch: "durable_queue",
          reconciled,
          orphansReconciled,
          recovered,
          demoCleanup: {
            authority: "G6_VERIFIED_DELETE_ONLY",
            executionEnabled: false,
            reason: "G6_R_RELEASE_GATE",
          },
          faceit,
        });
      },
    },
  },
});

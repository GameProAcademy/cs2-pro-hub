/**
 * Scheduled pipeline maintenance and THE FACEIT QUEUE WORKER (external caller:
 * cron).
 *
 * Bearer-secret authenticated with the existing Lovable cron helper or the
 * database-backed scheduler secret used by native pg_cron. It:
 *  - re-queues demo jobs stuck in `processing` past the stale window;
 *  - deletes temporary demo files whose retention window expired;
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
import { probeParserWorker } from "@/lib/pipeline/parser/remoteParser.server";

/** Wall-clock budget for the FACEIT part of this invocation. */
const FACEIT_WORKER_BUDGET_MS = 20_000;

export const Route = createFileRoute("/api/public/pipeline-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticatePipelineCronRequest(request);
        if (unauthorized) return unauthorized;

        const parserPreflight = await probeParserWorker();

        const { claimNextJob, cleanupExpiredDemos, processJob, recoverStaleJobs } =
          await import("@/lib/pipeline/jobs.server");
        const { runFaceitSyncWorker } = await import("@/lib/faceit/faceit.sync.server");

        const recovered = await recoverStaleJobs();
        const deleted = await cleanupExpiredDemos(50);

        // Fail closed: only claim a demo when the parser is fully ready,
        // including a successful /health + /version identity/contract check.
        // This prevents scheduler retries from consuming jobs while the parser
        // dependency is unavailable or running an incompatible contract.
        const parserReady =
          parserPreflight.healthy &&
          parserPreflight.error === null &&
          parserPreflight.identity !== null;
        const parserGate = parserReady ? "PASS" : "BLOCKED";
        const jobId = parserReady ? await claimNextJob() : null;
        const processed = jobId ? await processJob(jobId) : null;

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
          parserPreflight: {
            endpoint: parserPreflight.endpoint,
            healthy: parserPreflight.healthy,
            healthStatus: parserPreflight.healthStatus,
            identity: parserPreflight.identity
              ? {
                  name: parserPreflight.identity.name,
                  version: parserPreflight.identity.version,
                  revision: parserPreflight.identity.revision,
                  contractVersion: parserPreflight.identity.contractVersion,
                }
              : null,
            error: parserPreflight.error,
          },
          parserGate,
          recovered,
          deleted,
          processed: processed
            ? { status: processed.status, errorCode: processed.errorCode ?? null }
            : null,
          faceit,
        });
      },
    },
  },
});

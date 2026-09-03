/**
 * Scheduled pipeline maintenance (external caller: cron).
 *
 * Bearer-secret authenticated with the existing cron helper. It only:
 *  - re-queues jobs stuck in `processing` past the stale window;
 *  - deletes temporary demo files whose retention window expired;
 *  - advances at most one queued job (concurrency-limited).
 *
 * No PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/pipeline-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { claimNextJob, cleanupExpiredDemos, processJob, recoverStaleJobs } = await import(
          "@/lib/pipeline/jobs.server"
        );

        const recovered = await recoverStaleJobs();
        const deleted = await cleanupExpiredDemos(50);
        const jobId = await claimNextJob();
        const processed = jobId ? await processJob(jobId) : null;

        return Response.json({
          recovered,
          deleted,
          processed: processed ? { status: processed.status, errorCode: processed.errorCode ?? null } : null,
        });
      },
    },
  },
});

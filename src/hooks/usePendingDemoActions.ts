/**
 * PR5 — pending demo actions (player identification) for the menu, the Dashboard and the
 * upload page. Shares the history query (same key and function as DemoIngestPanel), so it is
 * one cache and one source of truth: the backend job rows.
 */
import { useQuery } from "@tanstack/react-query";

import { listMyDemoJobs, type DemoJobView } from "@/lib/pipeline.functions";
import { pendingIdentityJobs } from "@/lib/pipeline/errorGuidance";

export function usePendingDemoActions(): { pending: DemoJobView[]; count: number } {
  const jobs = useQuery({
    queryKey: ["pipeline", "jobs"],
    queryFn: () => listMyDemoJobs(),
    staleTime: 30_000,
  });
  const pending = pendingIdentityJobs(jobs.data ?? []);
  return { pending, count: pending.length };
}

/**
 * The worker build the H3E91 execution bridge accepts, as a non-secret fact.
 *
 * In production the bridge refuses every execution event whose
 * `workerBuildCommit` differs from `H3E91_EXPECTED_WORKER_BUILD_COMMIT`
 * (src/lib/pipeline/h3e91ExecutionBridge.server.ts). A commit hash is not a
 * secret, but the bridge authenticates the worker before comparing, so no
 * read-only probe can observe it. Publishing the expectation lets the H.3-E
 * activation gate compare it with the build the worker actually serves.
 */
export type BridgeWorkerIdentity = {
  expectedWorkerBuildCommit: string | null;
  configured: boolean;
  enforced: boolean;
};

const COMMIT = /^[0-9a-f]{40}$/;

export function bridgeWorkerIdentity(
  env: Record<string, string | undefined>,
): BridgeWorkerIdentity {
  const raw = (env["H3E91_EXPECTED_WORKER_BUILD_COMMIT"] ?? "").trim();
  const configured = COMMIT.test(raw);
  return {
    // Anything that is not an exact commit is reported as absent, never echoed.
    expectedWorkerBuildCommit: configured ? raw : null,
    configured,
    enforced: env["NODE_ENV"] === "production",
  };
}

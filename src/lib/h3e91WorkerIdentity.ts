/**
 * The worker build the H3E91 execution bridge accepts, as a non-secret fact.
 *
 * The bridge refuses every execution event whose
 * `workerBuildCommit` differs from `H3E91_EXPECTED_WORKER_BUILD_COMMIT`
 * (src/lib/pipeline/h3e91ExecutionBridge.server.ts). A commit hash is not a
 * secret, but the bridge authenticates the worker before comparing, so no
 * read-only probe can observe it. Publishing the expectation lets the H.3-E
 * activation gate compare it with the build the worker actually serves.
 *
 * Every value is read with the exact source expression the bridge uses
 * (`process.env["…"]`, no trimming): a bundler that rewrites one rewrites the
 * other, so `configured` reports what the bridge decides rather than what a
 * differently written expression would evaluate to.
 *
 * `enforced` is a constant: the bridge compares the identity unconditionally
 * (no NODE_ENV branch), and without a valid expectation it refuses every event
 * (H3E91_EXPECTED_WORKER_BUILD_COMMIT_UNCONFIGURED). `configured=false` is
 * therefore fail-closed, never a bypass; the activation gate still requires
 * both flags and the exact commit.
 */
export type BridgeWorkerIdentity = {
  expectedWorkerBuildCommit: string | null;
  configured: boolean;
  enforced: boolean;
};

export function bridgeWorkerIdentity(): BridgeWorkerIdentity {
  const expectedBuild = process.env["H3E91_EXPECTED_WORKER_BUILD_COMMIT"] ?? "";
  const configured = /^[0-9a-f]{40}$/.test(expectedBuild);
  return {
    // Anything the bridge would reject as unconfigured is reported as absent, never echoed.
    expectedWorkerBuildCommit: configured ? expectedBuild : null,
    configured,
    enforced: true,
  };
}

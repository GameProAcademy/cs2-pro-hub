/** Diagnostic decision only. A proof describes evidence; it is not an execution permit. */
export const H3E91_R41_REQUIRED_PROOFS = [
  "writerContract",
  "writerSecurity",
  "writerExecuteGrant",
  "eventDigest",
  "lifecycle",
  "idempotency",
  "databaseConcurrency",
  "appIntentOrdering",
  "railwayStartedOrdering",
  "railwayTerminalEvents",
  "durableWorker",
  "independentV1Parse",
  "authenticatedBridge",
  "browserSealedOrInstrumented",
  "referenceImageExclusion",
  "discovery",
  "securityAudit",
  "failureInjection",
  "ci",
  "deployedSourceParity",
] as const;

export type H3E91R41Proof = (typeof H3E91_R41_REQUIRED_PROOFS)[number];
export type H3E91R41ProofStatus = "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN";
export type H3E91R41Proofs = Readonly<Record<H3E91R41Proof, H3E91R41ProofStatus>>;

export function evaluateH3E91R41Authority(proofs: H3E91R41Proofs) {
  const blockers = H3E91_R41_REQUIRED_PROOFS.filter((proof) => proofs[proof] !== "PASS");
  return {
    status: blockers.length === 0 ? "READY_FOR_INDEPENDENT_EXTERNAL_AUDIT" : "BLOCKED",
    blockers,
    // Even a fully evidenced local contract is NOT permission to run a DEM.
    realDemAuthorized: false,
    canonicalAuthorized: false,
  } as const;
}

/** The current state must never infer a proof from an empty ledger or source presence. */
export const H3E91_R41_CURRENT_PROOFS: H3E91R41Proofs = Object.fromEntries(
  H3E91_R41_REQUIRED_PROOFS.map((proof) => [proof, "UNKNOWN"]),
) as H3E91R41Proofs;
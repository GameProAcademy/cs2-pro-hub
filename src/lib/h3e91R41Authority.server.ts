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

/** Proof provenance is independent of the proof result; source cannot attest a deployment. */
export const H3E91_R41_AUTHORITY_LEVELS = [
  "SOURCE_IMPLEMENTED", "LIVE_DB_VERIFIED", "SYNTHETIC_PROVEN", "DEPLOYED_VERIFIED",
] as const;
export type H3E91R41AuthorityLevel = (typeof H3E91_R41_AUTHORITY_LEVELS)[number];

export function evaluateH3E91R41Evidence(
  proofs: H3E91R41Proofs,
  provenance: Readonly<Partial<Record<H3E91R41Proof, H3E91R41AuthorityLevel>>>,
) {
  const required = H3E91_R41_REQUIRED_PROOFS.filter((proof) => !provenance[proof]);
  const parity = provenance.deployedSourceParity === "DEPLOYED_VERIFIED";
  const decision = evaluateH3E91R41Authority(proofs);
  return {
    ...decision,
    status: required.length === 0 && parity ? decision.status : "BLOCKED",
    blockers: [...new Set([...decision.blockers, ...required, ...(parity ? [] : ["deployedSourceParity" as const])])],
    provenance,
  } as const;
}

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
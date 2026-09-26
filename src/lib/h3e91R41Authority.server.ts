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
  "SOURCE_IMPLEMENTED", "LIVE_DB_VERIFIED", "SYNTHETIC_PROVEN", "BUILD_PROVEN", "DOCKER_SYNTHETIC", "CI_EXTERNAL_VERIFIED", "DEPLOYED_VERIFIED",
] as const;
export type H3E91R41AuthorityLevel = (typeof H3E91_R41_AUTHORITY_LEVELS)[number];

/** These are independent evidence dimensions, not an ordered ladder. */
export const H3E91_R41_MINIMUM_PROVENANCE: Readonly<Record<H3E91R41Proof, readonly H3E91R41AuthorityLevel[]>> = {
  writerContract: ["LIVE_DB_VERIFIED"], writerSecurity: ["LIVE_DB_VERIFIED"], writerExecuteGrant: ["LIVE_DB_VERIFIED"],
  eventDigest: ["LIVE_DB_VERIFIED", "SYNTHETIC_PROVEN"], lifecycle: ["LIVE_DB_VERIFIED", "SYNTHETIC_PROVEN"],
  idempotency: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN"], databaseConcurrency: ["SYNTHETIC_PROVEN"],
  appIntentOrdering: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN"],
  railwayStartedOrdering: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN", "DEPLOYED_VERIFIED"],
  railwayTerminalEvents: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN", "DEPLOYED_VERIFIED"],
  durableWorker: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN", "DEPLOYED_VERIFIED"],
  independentV1Parse: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN", "DEPLOYED_VERIFIED"],
  authenticatedBridge: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN", "LIVE_DB_VERIFIED"],
  browserSealedOrInstrumented: ["SOURCE_IMPLEMENTED", "BUILD_PROVEN", "DEPLOYED_VERIFIED"],
  referenceImageExclusion: ["SOURCE_IMPLEMENTED", "DOCKER_SYNTHETIC", "DEPLOYED_VERIFIED"],
  discovery: ["SOURCE_IMPLEMENTED", "SYNTHETIC_PROVEN"], securityAudit: ["LIVE_DB_VERIFIED"],
  failureInjection: ["SYNTHETIC_PROVEN"], ci: ["CI_EXTERNAL_VERIFIED"],
  deployedSourceParity: ["DEPLOYED_VERIFIED"],
};

export function evaluateH3E91R41Evidence(
  proofs: H3E91R41Proofs,
  provenance: Readonly<Partial<Record<H3E91R41Proof, readonly H3E91R41AuthorityLevel[]>>>,
) {
  const required = H3E91_R41_REQUIRED_PROOFS.filter((proof) =>
    H3E91_R41_MINIMUM_PROVENANCE[proof].some((level) => !provenance[proof]?.includes(level)),
  );
  const decision = evaluateH3E91R41Authority(proofs);
  return {
    ...decision,
    status: required.length === 0 ? decision.status : "BLOCKED",
    blockers: [...new Set([...decision.blockers, ...required])],
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
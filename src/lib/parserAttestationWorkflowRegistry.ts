export const APPROVED_ATTESTATION_WORKFLOW_PATH =
  ".github/workflows/parser-runtime-attestation.yml" as const;

// Git blob SHA-1 of the reviewed workflow source. A content digest avoids the
// impossible self-reference created by embedding the containing commit SHA.
export const APPROVED_ATTESTATION_WORKFLOW_SHA =
  "7c950521c5d25a72284e7f1af1d8450f0484c594" as const;

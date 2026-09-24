export const APPROVED_ATTESTATION_WORKFLOW_PATH =
  ".github/workflows/parser-runtime-attestation.yml" as const;

// Git blob SHA-1 of the reviewed workflow source. A content digest avoids the
// impossible self-reference created by embedding the containing commit SHA.
export const APPROVED_ATTESTATION_WORKFLOW_SHA =
  "9a1828c07f53106e6d098122495f583f1972a58a" as const;

export const APPROVED_ATTESTATION_WORKFLOW_PATH =
  ".github/workflows/parser-runtime-attestation.yml" as const;

// Git blob SHA-1 of the reviewed workflow source. A content digest avoids the
// impossible self-reference created by embedding the containing commit SHA.
export const APPROVED_ATTESTATION_WORKFLOW_SHA =
  "5039bff74550f02291fd066c7f10d781f6b86ebe" as const;
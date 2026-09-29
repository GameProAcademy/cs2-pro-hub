export const APPROVED_ATTESTATION_WORKFLOW_PATH =
  ".github/workflows/parser-runtime-attestation.yml" as const;

// Git blob SHA-1 of the reviewed workflow source. A content digest avoids the
// impossible self-reference created by embedding the containing commit SHA.
export const APPROVED_ATTESTATION_WORKFLOW_SHA =
  "3070d8bae6c3f02093bbb2595138c913646c2e31" as const;

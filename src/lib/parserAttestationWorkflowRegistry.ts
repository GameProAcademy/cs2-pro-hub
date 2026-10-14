export const APPROVED_ATTESTATION_WORKFLOW_PATH =
  ".github/workflows/parser-runtime-attestation.yml" as const;

// Git blob SHA-1 of the reviewed workflow source. A content digest avoids the
// impossible self-reference created by embedding the containing commit SHA.
export const APPROVED_ATTESTATION_WORKFLOW_SHA =
  "523cee5b0fecc21c7ce2b5f538b42670eec3fed1" as const;

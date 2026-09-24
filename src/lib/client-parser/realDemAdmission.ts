import type { DemoParserCapability } from "./clientParser.input";

export const REAL_DEM_BROWSER_ADMISSION_STATES = [
  "BLOCKED",
  "METADATA_ONLY",
] as const;
export type RealDemBrowserAdmissionState =
  (typeof REAL_DEM_BROWSER_ADMISSION_STATES)[number];

export const REAL_DEM_BROWSER_BLOCKERS = [
  "REAL_PARSER_DISABLED",
  "EXPERIMENT_DISABLED",
  "ABOVE_CONTIGUOUS_INPUT_LIMIT",
  "PARSER_REQUIRES_CONTIGUOUS_BUFFER",
  "SYNTHETIC_MEMORY_EVIDENCE_ONLY",
  "PARSER_OVERHEAD_UNMEASURED",
  "PARITY_NOT_VERIFIED",
  "DETERMINISM_NOT_VERIFIED",
  "ATTESTATION_NOT_FRESH",
  "RETENTION_AUTHORIZATION_NOT_VERIFIED",
  "CANONICAL_ADMISSION_LOCKED",
] as const;

export type RealDemBrowserAdmissionBlocker =
  (typeof REAL_DEM_BROWSER_BLOCKERS)[number];

export interface RealDemBrowserAdmissionInput {
  fileName: string;
  sizeBytes: number;
  parserCapability: DemoParserCapability;
  experimentalEnabled: boolean;
  realParserEnabled: boolean;
  syntheticMemoryEvidenceAccepted: boolean;
  parserOverheadMeasured: boolean;
  parityVerified: boolean;
  determinismVerified: boolean;
  attestationFresh: boolean;
  retentionAuthorizationVerified: boolean;
  canonicalAdmissionLocked: boolean;
}

export interface RealDemBrowserAdmission {
  state: RealDemBrowserAdmissionState;
  canParse: false;
  canPersist: false;
  canCanonicalize: false;
  operation: "METADATA_ONLY";
  blockers: RealDemBrowserAdmissionBlocker[];
  evidenceClass: "FAIL_CLOSED_ARCHITECTURE_GATE";
}

/**
 * H.2 is deliberately an authorization gate, not a capability guess.
 *
 * A real DEM can be inspected as metadata, but no current evidence is allowed
 * to authorize browser parsing. In particular, H.1 synthetic memory evidence
 * never becomes real-DEM support evidence.
 */
export function evaluateRealDemBrowserAdmission(
  input: RealDemBrowserAdmissionInput,
): RealDemBrowserAdmission {
  const blockers: RealDemBrowserAdmissionBlocker[] = [];

  if (!input.realParserEnabled) blockers.push("REAL_PARSER_DISABLED");
  if (!input.experimentalEnabled) blockers.push("EXPERIMENT_DISABLED");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
    blockers.push("ABOVE_CONTIGUOUS_INPUT_LIMIT");
  } else if (input.sizeBytes > 128 * 1024 * 1024) {
    blockers.push("ABOVE_CONTIGUOUS_INPUT_LIMIT");
  }
  if (input.parserCapability.requiresContiguousBuffer)
    blockers.push("PARSER_REQUIRES_CONTIGUOUS_BUFFER");
  if (input.syntheticMemoryEvidenceAccepted)
    blockers.push("SYNTHETIC_MEMORY_EVIDENCE_ONLY");
  if (!input.parserOverheadMeasured) blockers.push("PARSER_OVERHEAD_UNMEASURED");
  if (!input.parityVerified) blockers.push("PARITY_NOT_VERIFIED");
  if (!input.determinismVerified) blockers.push("DETERMINISM_NOT_VERIFIED");
  if (!input.attestationFresh) blockers.push("ATTESTATION_NOT_FRESH");
  if (!input.retentionAuthorizationVerified)
    blockers.push("RETENTION_AUTHORIZATION_NOT_VERIFIED");
  if (input.canonicalAdmissionLocked) blockers.push("CANONICAL_ADMISSION_LOCKED");

  return {
    state: "BLOCKED",
    canParse: false,
    canPersist: false,
    canCanonicalize: false,
    operation: "METADATA_ONLY",
    blockers: [...new Set(blockers)],
    evidenceClass: "FAIL_CLOSED_ARCHITECTURE_GATE",
  };
}

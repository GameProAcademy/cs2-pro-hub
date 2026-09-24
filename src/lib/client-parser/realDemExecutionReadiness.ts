import type { DemoParserCapability } from "./clientParser.input";

export const REAL_DEM_EXECUTION_READINESS_STATES = [
  "BLOCKED",
  "READY_FOR_CONTROLLED_EXECUTION",
] as const;
export type RealDemExecutionReadinessState = (typeof REAL_DEM_EXECUTION_READINESS_STATES)[number];

export const REAL_DEM_EXECUTION_BLOCKERS = [
  "INVALID_DEM_IDENTITY",
  "DEM_IDENTITY_NOT_VERIFIED",
  "PARSER_BUILD_NOT_VERIFIED",
  "CONTRACT_NOT_VERIFIED",
  "RUNTIME_ARTIFACT_NOT_VERIFIED",
  "RUNTIME_PREFLIGHT_NOT_VERIFIED",
  "INPUT_STRATEGY_NOT_VERIFIED",
  "SURFACE_CAPACITY_NOT_VERIFIED",
  "REAL_MEMORY_NOT_OBSERVED",
  "PARSER_OVERHEAD_NOT_MEASURED",
  "PARITY_NOT_VERIFIED",
  "DETERMINISM_NOT_VERIFIED",
  "TICK_AUTHORITY_NOT_VERIFIED",
  "PLAYER_IDENTITY_NOT_VERIFIED",
  "RETENTION_AUTHORIZATION_NOT_VERIFIED",
  "ATTESTATION_NOT_FRESH",
  "EXECUTION_AUTHORIZATION_NOT_GRANTED",
  "CANONICAL_LOCK_NOT_ACTIVE",
] as const;
export type RealDemExecutionReadinessBlocker = (typeof REAL_DEM_EXECUTION_BLOCKERS)[number];

export type RealDemExecutionSurface = "RAILWAY_CONTROLLED" | "BROWSER";
export type RealDemInputStrategy = "CONTIGUOUS_BUFFER" | "STREAMING" | "FILE_PATH";

export interface RealDemExecutionReadinessInput {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  parserCapability: DemoParserCapability;
  parserBuildIdentity: string;
  contractVersion: number;
  runtimeArtifactIdentity: string;
  executionSurface: RealDemExecutionSurface;
  inputStrategy: RealDemInputStrategy;
  identityVerified: boolean;
  parserBuildVerified: boolean;
  contractVerified: boolean;
  runtimeArtifactVerified: boolean;
  inputStrategyVerified: boolean;
  surfaceCapacityVerified: boolean;
  runtimePreflightVerified: boolean;
  realMemoryObserved: boolean;
  parserOverheadMeasured: boolean;
  parityVerified: boolean;
  determinismVerified: boolean;
  tickAuthorityVerified: boolean;
  playerIdentityVerified: boolean;
  retentionAuthorizationVerified: boolean;
  attestationFresh: boolean;
  executionAuthorizationGranted: boolean;
  canonicalAdmissionLocked: boolean;
}

export interface RealDemExecutionReadiness {
  state: RealDemExecutionReadinessState;
  canExecute: boolean;
  canPersist: false;
  canCanonicalize: false;
  operation: "METADATA_ONLY" | "CONTROLLED_EXECUTION_ONLY";
  blockers: RealDemExecutionReadinessBlocker[];
  postExecutionEvidenceBlockers: RealDemExecutionReadinessBlocker[];
  evidenceClass: "FAIL_CLOSED_PRE_EXECUTION_GATE";
}

/**
 * H.3 is a pre-execution authorization envelope.
 *
 * It does not execute a DEM and does not grant persistence or Canonical
 * admission. A READY result means that the caller has explicitly supplied
 * every required evidence bit for one exact controlled execution surface.
 */
export function evaluateRealDemExecutionReadiness(
  input: RealDemExecutionReadinessInput,
): RealDemExecutionReadiness {
  const blockers: RealDemExecutionReadinessBlocker[] = [];
  const postExecutionEvidenceBlockers: RealDemExecutionReadinessBlocker[] = [];

  if (
    !input.fileName.trim() ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    !/^[0-9a-f]{64}$/i.test(input.sha256)
  ) {
    blockers.push("INVALID_DEM_IDENTITY");
  }
  if (!input.identityVerified) blockers.push("DEM_IDENTITY_NOT_VERIFIED");
  if (!input.parserBuildIdentity.trim() || !input.parserBuildVerified)
    blockers.push("PARSER_BUILD_NOT_VERIFIED");
  if (
    !Number.isInteger(input.contractVersion) ||
    input.contractVersion < 1 ||
    !input.contractVerified
  )
    blockers.push("CONTRACT_NOT_VERIFIED");
  if (!input.runtimeArtifactIdentity.trim() || !input.runtimeArtifactVerified)
    blockers.push("RUNTIME_ARTIFACT_NOT_VERIFIED");
  if (!input.inputStrategyVerified) blockers.push("INPUT_STRATEGY_NOT_VERIFIED");
  if (!input.surfaceCapacityVerified) blockers.push("SURFACE_CAPACITY_NOT_VERIFIED");
  if (input.executionSurface === "BROWSER" && input.sizeBytes > 128 * 1024 * 1024)
    blockers.push("SURFACE_CAPACITY_NOT_VERIFIED");
  if (!input.runtimePreflightVerified) blockers.push("RUNTIME_PREFLIGHT_NOT_VERIFIED");
  if (!input.parserOverheadMeasured) postExecutionEvidenceBlockers.push("PARSER_OVERHEAD_NOT_MEASURED");
  if (!input.parityVerified) postExecutionEvidenceBlockers.push("PARITY_NOT_VERIFIED");
  if (!input.determinismVerified) postExecutionEvidenceBlockers.push("DETERMINISM_NOT_VERIFIED");
  if (!input.tickAuthorityVerified) postExecutionEvidenceBlockers.push("TICK_AUTHORITY_NOT_VERIFIED");
  if (!input.playerIdentityVerified) postExecutionEvidenceBlockers.push("PLAYER_IDENTITY_NOT_VERIFIED");
  if (!input.realMemoryObserved) postExecutionEvidenceBlockers.push("REAL_MEMORY_NOT_OBSERVED");
  if (!input.retentionAuthorizationVerified) blockers.push("RETENTION_AUTHORIZATION_NOT_VERIFIED");
  if (!input.attestationFresh) blockers.push("ATTESTATION_NOT_FRESH");
  if (!input.executionAuthorizationGranted) blockers.push("EXECUTION_AUTHORIZATION_NOT_GRANTED");
  if (!input.canonicalAdmissionLocked) blockers.push("CANONICAL_LOCK_NOT_ACTIVE");

  const uniqueBlockers = [...new Set(blockers)];
  const uniquePostExecutionEvidenceBlockers = [...new Set(postExecutionEvidenceBlockers)];
  const ready = uniqueBlockers.length === 0;

  return {
    state: ready ? "READY_FOR_CONTROLLED_EXECUTION" : "BLOCKED",
    canExecute: ready,
    canPersist: false,
    canCanonicalize: false,
    operation: ready ? "CONTROLLED_EXECUTION_ONLY" : "METADATA_ONLY",
    blockers: uniqueBlockers,
    postExecutionEvidenceBlockers: uniquePostExecutionEvidenceBlockers,
    evidenceClass: "FAIL_CLOSED_PRE_EXECUTION_GATE",
  };
}

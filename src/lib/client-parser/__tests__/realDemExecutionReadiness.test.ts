import { describe, expect, it } from "vitest";
import { CLIENT_DEMO_PARSER_CAPABILITY } from "../clientParser.input";
import {
  REAL_DEM_EXECUTION_READINESS_STATES,
  CONTROLLED_CACHE_EXECUTION_ENVELOPE,
  evaluateControlledCacheExecutionEnvelope,
  evaluateRealDemExecutionReadiness,
} from "../realDemExecutionReadiness";

const cacheBase = {
  fileName: "furia-vs-gamerlegion-m1-cache.dem",
  sizeBytes: 473_748_061,
  sha256: "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
  parserCapability: CLIENT_DEMO_PARSER_CAPABILITY,
  parserBuildIdentity: "demoparser2:0.42.0:git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
  contractVersion: 1,
  runtimeArtifactIdentity: "controlled-runtime-pending",
  executionSurface: "RAILWAY_CONTROLLED" as const,
  inputStrategy: "FILE_PATH" as const,
  identityVerified: true,
  parserBuildVerified: true,
  contractVerified: true,
  runtimeArtifactVerified: true,
  inputStrategyVerified: true,
  surfaceCapacityVerified: true,
  runtimePreflightVerified: true,
  realMemoryObserved: true,
  parserOverheadMeasured: true,
  parityVerified: true,
  determinismVerified: true,
  tickAuthorityVerified: true,
  playerIdentityVerified: true,
  retentionAuthorizationVerified: true,
  attestationFresh: true,
  executionAuthorizationGranted: true,
  canonicalAdmissionLocked: true,
};

describe("H.3 controlled real DEM execution readiness", () => {
  it("exposes only blocked or explicitly ready states", () => {
    expect(REAL_DEM_EXECUTION_READINESS_STATES).toEqual([
      "BLOCKED",
      "READY_FOR_CONTROLLED_EXECUTION",
    ]);
  });

  it("blocks the exact Cache DEM while any required evidence is missing", () => {
    const result = evaluateRealDemExecutionReadiness({
      ...cacheBase,
      runtimeArtifactVerified: false,
      runtimePreflightVerified: false,
      realMemoryObserved: false,
      parityVerified: false,
      determinismVerified: false,
      attestationFresh: false,
      executionAuthorizationGranted: false,
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.canExecute).toBe(false);
    expect(result.canPersist).toBe(false);
    expect(result.canCanonicalize).toBe(false);
    expect(result.operation).toBe("METADATA_ONLY");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "RUNTIME_ARTIFACT_NOT_VERIFIED",
        "RUNTIME_PREFLIGHT_NOT_VERIFIED",
        "ATTESTATION_NOT_FRESH",
        "EXECUTION_AUTHORIZATION_NOT_GRANTED",
      ]),
    );
    expect(result.postExecutionEvidenceBlockers).toEqual(
      expect.arrayContaining([
        "REAL_MEMORY_NOT_OBSERVED",
        "PARITY_NOT_VERIFIED",
        "DETERMINISM_NOT_VERIFIED",
      ]),
    );
  });

  it("blocks a 473 MiB DEM on the browser surface even with all other evidence present", () => {
    const result = evaluateRealDemExecutionReadiness({
      ...cacheBase,
      executionSurface: "BROWSER",
      inputStrategy: "CONTIGUOUS_BUFFER",
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.canExecute).toBe(false);
    expect(result.blockers).toContain("SURFACE_CAPACITY_NOT_VERIFIED");
  });

  it("requires a valid exact DEM identity", () => {
    const result = evaluateRealDemExecutionReadiness({
      ...cacheBase,
      sha256: "not-a-sha",
      identityVerified: false,
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.blockers).toContain("INVALID_DEM_IDENTITY");
    expect(result.blockers).toContain("DEM_IDENTITY_NOT_VERIFIED");
  });

  it("does not authorize persistence or Canonical even when every H.3 evidence bit is present", () => {
    const result = evaluateRealDemExecutionReadiness(cacheBase);

    expect(result.state).toBe("READY_FOR_CONTROLLED_EXECUTION");
    expect(result.canExecute).toBe(true);
    expect(result.canPersist).toBe(false);
    expect(result.canCanonicalize).toBe(false);
    expect(result.operation).toBe("CONTROLLED_EXECUTION_ONLY");
    expect(result.blockers).toEqual([]);
    expect(result.postExecutionEvidenceBlockers).toEqual([]);
  });

  it("can authorize the first controlled run before post-run semantic evidence exists", () => {
    const result = evaluateRealDemExecutionReadiness({
      ...cacheBase,
      realMemoryObserved: false,
      parserOverheadMeasured: false,
      parityVerified: false,
      determinismVerified: false,
      tickAuthorityVerified: false,
      playerIdentityVerified: false,
    });

    expect(result.state).toBe("READY_FOR_CONTROLLED_EXECUTION");
    expect(result.canExecute).toBe(true);
    expect(result.postExecutionEvidenceBlockers).toEqual(
      expect.arrayContaining([
        "REAL_MEMORY_NOT_OBSERVED",
        "PARSER_OVERHEAD_NOT_MEASURED",
        "PARITY_NOT_VERIFIED",
        "DETERMINISM_NOT_VERIFIED",
        "TICK_AUTHORITY_NOT_VERIFIED",
        "PLAYER_IDENTITY_NOT_VERIFIED",
      ]),
    );
  });

  it("requires the Canonical lock to remain active during controlled execution", () => {
    const result = evaluateRealDemExecutionReadiness({
      ...cacheBase,
      canonicalAdmissionLocked: false,
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.canExecute).toBe(false);
    expect(result.blockers).toContain("CANONICAL_LOCK_NOT_ACTIVE");
  });
});



describe("H.3-E controlled Cache execution envelope", () => {
  it("freezes the authorized Cache identity and Railway file-path surface", () => {
    expect(CONTROLLED_CACHE_EXECUTION_ENVELOPE).toEqual({
      fileName: "furia-vs-gamerlegion-m1-cache.dem",
      sizeBytes: 473_748_061,
      sha256: "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d",
      parserBuildIdentity:
        "demoparser2:0.42.0:git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
      contractVersion: 1,
      executionSurface: "RAILWAY_CONTROLLED",
      inputStrategy: "FILE_PATH",
    });
  });

  it("blocks an envelope mismatch even when every generic H.3 evidence bit is green", () => {
    const result = evaluateControlledCacheExecutionEnvelope({
      ...cacheBase,
      sha256: "1".repeat(64),
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.canExecute).toBe(false);
    expect(result.operation).toBe("METADATA_ONLY");
    expect(result.blockers).toContain("CONTROLLED_ENVELOPE_MISMATCH");
  });

  it("keeps post-run evidence separate from pre-execution authorization", () => {
    const result = evaluateControlledCacheExecutionEnvelope({
      ...cacheBase,
      realMemoryObserved: false,
      parserOverheadMeasured: false,
      parityVerified: false,
      determinismVerified: false,
      tickAuthorityVerified: false,
      playerIdentityVerified: false,
    });

    expect(result.state).toBe("READY_FOR_CONTROLLED_EXECUTION");
    expect(result.canExecute).toBe(true);
    expect(result.canPersist).toBe(false);
    expect(result.canCanonicalize).toBe(false);
    expect(result.postExecutionEvidenceBlockers).toEqual(
      expect.arrayContaining([
        "REAL_MEMORY_NOT_OBSERVED",
        "PARSER_OVERHEAD_NOT_MEASURED",
        "PARITY_NOT_VERIFIED",
        "DETERMINISM_NOT_VERIFIED",
        "TICK_AUTHORITY_NOT_VERIFIED",
        "PLAYER_IDENTITY_NOT_VERIFIED",
      ]),
    );
  });
});

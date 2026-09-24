import { describe, expect, it } from "vitest";
import { CLIENT_DEMO_PARSER_CAPABILITY } from "../clientParser.input";
import {
  REAL_DEM_BROWSER_ADMISSION_STATES,
  evaluateRealDemBrowserAdmission,
} from "../realDemAdmission";

const base = {
  fileName: "authorized-cache.dem",
  sizeBytes: 128 * 1024 * 1024,
  parserCapability: CLIENT_DEMO_PARSER_CAPABILITY,
  experimentalEnabled: true,
  realParserEnabled: true,
  syntheticMemoryEvidenceAccepted: false,
  parserOverheadMeasured: false,
  parityVerified: false,
  determinismVerified: false,
  attestationFresh: false,
  retentionAuthorizationVerified: false,
  canonicalAdmissionLocked: true,
};

describe("H.2 real DEM browser admission gate", () => {
  it("exposes only fail-closed states", () => {
    expect(REAL_DEM_BROWSER_ADMISSION_STATES).toEqual([
      "BLOCKED",
      "METADATA_ONLY",
    ]);
  });

  it("never converts synthetic H.1 evidence into real DEM authorization", () => {
    const result = evaluateRealDemBrowserAdmission({
      ...base,
      syntheticMemoryEvidenceAccepted: true,
    });
    expect(result.state).toBe("BLOCKED");
    expect(result.canParse).toBe(false);
    expect(result.canPersist).toBe(false);
    expect(result.canCanonicalize).toBe(false);
    expect(result.operation).toBe("METADATA_ONLY");
    expect(result.blockers).toContain("SYNTHETIC_MEMORY_EVIDENCE_ONLY");
  });

  it("blocks the exact 128 MiB ceiling because real parser authorization is independent", () => {
    const result = evaluateRealDemBrowserAdmission({
      ...base,
      realParserEnabled: false,
    });
    expect(result.state).toBe("BLOCKED");
    expect(result.blockers).toContain("REAL_PARSER_DISABLED");
    expect(result.blockers).toContain("PARSER_OVERHEAD_UNMEASURED");
    expect(result.blockers).toContain("PARITY_NOT_VERIFIED");
    expect(result.blockers).toContain("DETERMINISM_NOT_VERIFIED");
    expect(result.blockers).toContain("ATTESTATION_NOT_FRESH");
    expect(result.blockers).toContain("RETENTION_AUTHORIZATION_NOT_VERIFIED");
    expect(result.blockers).toContain("CANONICAL_ADMISSION_LOCKED");
  });

  it.each([
    128 * 1024 * 1024 + 1,
    300 * 1024 * 1024,
    400 * 1024 * 1024,
    500 * 1024 * 1024,
    473_748_061,
  ])("blocks %i-byte real DEM input before parser execution", (sizeBytes) => {
    const result = evaluateRealDemBrowserAdmission({ ...base, sizeBytes });
    expect(result.state).toBe("BLOCKED");
    expect(result.canParse).toBe(false);
    expect(result.blockers).toContain("ABOVE_CONTIGUOUS_INPUT_LIMIT");
  });

  it("keeps parser persistence and Canonical independently closed", () => {
    const result = evaluateRealDemBrowserAdmission({
      ...base,
      realParserEnabled: false,
      experimentalEnabled: false,
    });
    expect(result.canParse).toBe(false);
    expect(result.canPersist).toBe(false);
    expect(result.canCanonicalize).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining(["REAL_PARSER_DISABLED", "EXPERIMENT_DISABLED"]),
    );
  });
});

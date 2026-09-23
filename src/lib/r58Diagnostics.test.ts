import { describe, expect, it } from "vitest";
import {
  R58_OPERATOR_ATTESTATION_ENDPOINT,
  classifyR58AttestationEndpoint,
  classifyR58ServerRailwayApiToken,
} from "./r58Diagnostics.server";

describe("R5.8 operator diagnostic helpers", () => {
  it("accepts the canonical parser attestation origin", () => {
    expect(classifyR58AttestationEndpoint(R58_OPERATOR_ATTESTATION_ENDPOINT)).toBe("CONFIGURED");
  });

  it("rejects the obsolete application-host route as a mismatch", () => {
    expect(
      classifyR58AttestationEndpoint(
        "https://gamepro.network/api/public/parser-attestation",
      ),
    ).toBe("MISMATCH");
  });

  it("reports a missing endpoint explicitly", () => {
    expect(classifyR58AttestationEndpoint(undefined)).toBe("MISSING");
  });

  it("never infers the GitHub Actions Railway secret from the server environment", () => {
    expect(classifyR58ServerRailwayApiToken()).toBe("NOT_CHECKED");
  });
});

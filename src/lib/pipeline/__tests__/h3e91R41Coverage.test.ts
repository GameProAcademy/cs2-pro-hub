import { describe, expect, it } from "vitest";
import { H3E91_R41_COVERAGE } from "@/lib/h3e91R41Coverage.server";

describe("R4.1 source checkpoint remains diagnostic", () => {
  it("never promotes an empty uninstrumented ledger", () => {
    expect(H3E91_R41_COVERAGE.status).toBe("BLOCKED");
    expect(H3E91_R41_COVERAGE.writer.present).toBe(true);
    expect(H3E91_R41_COVERAGE.ledgerAuthority).toBe("UNINSTRUMENTED");
    expect(H3E91_R41_COVERAGE.writerCoverageVerified).toBe(false);
    expect(H3E91_R41_COVERAGE.deployedParity).toBe("UNKNOWN");
  });
  it("lists source-covered entry points without claiming deployed runtime coverage", () => {
    expect(Object.keys(H3E91_R41_COVERAGE.surfaces).sort()).toEqual(
      [
        "APP_REMOTE_PARSER",
        "RAILWAY_DURABLE_WORKER",
        "RAILWAY_V1_PARSE",
        "BROWSER_WASM_POC",
        "REFERENCE_CLI",
      ].sort(),
    );
    expect(
      Object.values(H3E91_R41_COVERAGE.surfaces)
        .filter((surface) => surface.classification === "PRODUCTION_EXECUTION_SURFACE")
        .every((surface) => surface.status === "BLOCKED" && surface.deployedParity === "UNKNOWN"),
    ).toBe(true);
    for (const surface of [H3E91_R41_COVERAGE.surfaces.APP_REMOTE_PARSER, H3E91_R41_COVERAGE.surfaces.RAILWAY_DURABLE_WORKER, H3E91_R41_COVERAGE.surfaces.RAILWAY_V1_PARSE]) {
      expect(surface.writerBeforeExecution).toBe(true);
      expect(surface.startedBeforeParser).toBe(true);
      expect(surface.productionActivation).toBe("BLOCKED");
    }
    expect(H3E91_R41_COVERAGE.surfaces.REFERENCE_CLI.status).toBe("IMAGE_EXCLUSION_SOURCE_ONLY");
  });
});

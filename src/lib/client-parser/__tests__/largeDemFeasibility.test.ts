import { describe, expect, it } from "vitest";
import { Sha256 } from "@/lib/pipeline/sha256";
import {
  LARGE_DEM_EXPERIMENTAL_ENABLED,
  LARGE_DEM_FEASIBILITY_STATES,
  LARGE_DEM_HASH_CHUNK_BYTES,
  preflightLargeDem,
} from "../largeDemFeasibility";
import { CLIENT_DEMO_MAX_BYTES } from "../clientParser.types";

const capabilities = {
  workerAvailable: true,
  wasmAvailable: true,
  memoryMeasurementAvailable: false,
  crossOriginIsolated: false,
};

describe("large DEM feasibility gate", () => {
  it("keeps the experimental gate off and 128 MiB ceiling unchanged", () => {
    expect(LARGE_DEM_EXPERIMENTAL_ENABLED).toBe(false);
    expect(CLIENT_DEMO_MAX_BYTES).toBe(128 * 1024 * 1024);
    expect(LARGE_DEM_FEASIBILITY_STATES).toEqual([
      "NOT_RUN",
      "BLOCKED_BY_SIZE",
      "BLOCKED_BY_MEMORY",
      "UNAVAILABLE",
      "SUPPORTED_BY_MEASUREMENT",
      "SUPPORTED_WITH_LIMITS",
      "FAILED",
    ]);
  });

  it.each([
    128 * 1024 * 1024,
    128 * 1024 * 1024 + 1,
    300 * 1024 * 1024,
    400 * 1024 * 1024,
    500 * 1024 * 1024,
    473_748_061,
  ])("classifies %i bytes as metadata-only capability evidence", (sizeBytes) => {
    const result = preflightLargeDem({ name: "synthetic.dem", sizeBytes }, capabilities);
    expect(result.state).toBe("NOT_RUN");
    expect(result.evidenceClass).toBe("CAPABILITY_HINT");
    expect(result.memoryMeasurement).toBe("MEMORY_UNAVAILABLE");
    expect(result.parserInputStrategy).toBe("WASM_INPUT_REQUIRES_CONTIGUOUS_BUFFER");
  });

  it("hashes identical chunk streams deterministically", () => {
    const bytes = new TextEncoder().encode("gamepro-large-dem-hash-equivalence".repeat(4096));
    const whole = new Sha256().update(bytes).hex();
    const chunked = new Sha256();
    for (let offset = 0; offset < bytes.length; offset += 997)
      chunked.update(bytes.subarray(offset, offset + 997));
    expect(chunked.hex()).toBe(whole);
    expect(LARGE_DEM_HASH_CHUNK_BYTES).toBe(8 * 1024 * 1024);
  });
});

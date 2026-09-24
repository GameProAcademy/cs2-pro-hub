import { describe, expect, it } from "vitest";
import { Sha256 } from "@/lib/pipeline/sha256";
import {
  LARGE_DEM_EXPERIMENTAL_ENABLED,
  LARGE_DEM_FEASIBILITY_STATES,
  LARGE_DEM_HASH_CHUNK_BYTES,
  LARGE_DEM_READINESS_STATES,
  estimateLargeDemMemory,
  evaluateLargeDemFeasibility,
  preflightLargeDem,
} from "../largeDemFeasibility";
import { CLIENT_DEMO_PARSER_CAPABILITY } from "../clientParser.input";
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
    [128 * 1024 * 1024, "NOT_RUN"],
    [128 * 1024 * 1024 + 1, "BLOCKED_BY_SIZE"],
    [300 * 1024 * 1024, "BLOCKED_BY_SIZE"],
    [400 * 1024 * 1024, "BLOCKED_BY_SIZE"],
    [500 * 1024 * 1024, "BLOCKED_BY_SIZE"],
    [473_748_061, "BLOCKED_BY_SIZE"],
  ])("classifies %i bytes as metadata-only capability evidence", (sizeBytes, expectedState) => {
    const result = preflightLargeDem({ name: "synthetic.dem", sizeBytes }, capabilities);
    expect(result.state).toBe(expectedState);
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

  it.each([
    [0, "BLOCKED"],
    [1, "SAFE"],
    [128 * 1024 * 1024 - 1, "SAFE"],
    [128 * 1024 * 1024, "SAFE"],
    [128 * 1024 * 1024 + 1, "NOT_SUPPORTED"],
    [300 * 1024 * 1024, "NOT_SUPPORTED"],
    [400 * 1024 * 1024, "NOT_SUPPORTED"],
    [500 * 1024 * 1024, "NOT_SUPPORTED"],
    [473_748_061, "NOT_SUPPORTED"],
  ])("evaluates %i bytes without allocating a real file", (sizeBytes, expected) => {
    const result = evaluateLargeDemFeasibility(
      { name: "synthetic.dem", sizeBytes },
      CLIENT_DEMO_PARSER_CAPABILITY,
      {
        workerAvailable: true,
        wasmAvailable: true,
        experimentalEnabled: true,
        realParserEnabled: true,
      },
    );
    expect(result.state).toBe(expected);
    expect(result.canParse).toBe(false);
    expect(result.evidenceClass).toBe("CAPABILITY_HINT");
  });

  it("keeps authorization disabled independently of capability", () => {
    const result = evaluateLargeDemFeasibility(
      { name: "synthetic.dem", sizeBytes: 1 },
      CLIENT_DEMO_PARSER_CAPABILITY,
      {
        workerAvailable: true,
        wasmAvailable: true,
        experimentalEnabled: true,
        realParserEnabled: false,
      },
    );
    expect(result.state).toBe("NOT_RUN");
    expect(result.reason).toBe("REAL_PARSER_DISABLED");
    expect(result.canParse).toBe(false);
  });

  it("fails closed for unknown parser capability", () => {
    const result = evaluateLargeDemFeasibility(
      { name: "synthetic.dem", sizeBytes: 1 },
      { ...CLIENT_DEMO_PARSER_CAPABILITY, inputCapability: "UNKNOWN" },
      {
        workerAvailable: true,
        wasmAvailable: true,
        experimentalEnabled: true,
        realParserEnabled: true,
      },
    );
    expect(result.state).toBe("NOT_SUPPORTED");
    expect(result.canParse).toBe(false);
  });

  it("keeps unknown parser and WASM overhead out of the memory estimate", () => {
    const estimate = estimateLargeDemMemory(473_748_061, CLIENT_DEMO_PARSER_CAPABILITY);
    expect(estimate).toMatchObject({
      evidenceClass: "HEURISTIC",
      contiguousBufferBytes: 473_748_061,
      wasmOverheadBytes: null,
      parserOverheadBytes: null,
      estimatedPeakBytes: null,
      confidence: "LOW",
    });
    expect(LARGE_DEM_READINESS_STATES).toEqual([
      "SAFE",
      "CAUTION",
      "BLOCKED",
      "NOT_SUPPORTED",
      "NOT_RUN",
    ]);
  });
});

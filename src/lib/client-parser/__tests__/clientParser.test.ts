import { describe, expect, it } from "vitest";
import { CLIENT_PARSER_CAPABILITY_CATALOG } from "../clientParser.capabilities";
import { computeClientResultDigest, sha256Text } from "../clientParser.hash";
import { buildClientParserManifest } from "../clientParser.manifest";
import {
  buildNotRunFieldMatrix,
  compareFieldObservation,
  compareClientVsPythonSemantic,
  compareClientVsServerReference,
  evaluateDeterminism,
} from "../clientParser.parity";
import {
  CLIENT_PARSER_ARTIFACT_PROVENANCE,
  CLIENT_REQUIRED_RUNTIME_EXPORTS,
  capabilitiesForSurface,
  inspectRuntimeSurface,
  playerInventoryFromRuntime,
  trustedRuntimeUrl,
} from "../clientParser.runtime";
import {
  CLIENT_PARSER_BUILD_IDENTITY,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_RUNTIME,
  CLIENT_PARSER_SCHEMA_VERSION,
  CLIENT_PARSER_VERSION,
  type ClientParseResult,
} from "../clientParser.types";
import { validateClientParserResult } from "../clientParser.validator.server";

function result(): ClientParseResult {
  const value: ClientParseResult = {
    schemaVersion: CLIENT_PARSER_SCHEMA_VERSION,
    parser: {
      name: CLIENT_PARSER_NAME,
      version: CLIENT_PARSER_VERSION,
      runtime: CLIENT_PARSER_RUNTIME,
      buildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
      runtimeSurface: {
        observedExports: ["listGameEvents", "parseEvent", "parseHeader", "parseTicks"],
        minimumReady: true,
        runtimeSurfaceDigest: inspectRuntimeSurface({
          listGameEvents() {},
          parseEvent() {},
          parseHeader() {},
          parseTicks() {},
        }).runtimeSurfaceDigest,
      },
      apiCalls: CLIENT_REQUIRED_RUNTIME_EXPORTS.map((api) => ({
        api,
        exportPresent: true,
        callAttempted: true,
        callSucceeded: true,
        status: "CALL_SUCCEEDED" as const,
        errorType: null,
        errorMessage: null,
        durationMs: 1,
        resultBytes: 2,
        normalizedDigest: "c".repeat(64),
      })),
      artifact: {
        ...CLIENT_PARSER_ARTIFACT_PROVENANCE,
        bindingUrl: "https://example.test/pkg/demoparser2.js",
        wasmUrl: "https://example.test/pkg/demoparser2_bg.wasm",
      },
    },
    demo: { sha256: "b".repeat(64), sizeBytes: 42, name: "local.dem", lastModified: 1 },
    header: { map_name: "de_cache" },
    playerInventory: {
      status: "AVAILABLE",
      count: 1,
      players: [{ steamId: "76561198000000000", name: "Player", teamNumber: 2 }],
    },
    eventDiscovery: { status: "AVAILABLE", count: 1, names: ["round_end"] },
    parsedEventInventory: [
      { name: "round_end", status: "PRESENT_AND_PARSED", count: 1, fields: ["tick"] },
    ],
    selectedEventSamples: [{ eventName: "round_end", tick: 64, fields: { tick: 64 } }],
    roundSummary: { status: "UNAVAILABLE", count: null },
    tickProbe: {
      status: "AVAILABLE",
      requestedTickCount: 1,
      returnedTickCount: 1,
      propertiesRequested: ["tick"],
      firstTick: 64,
      lastTick: 64,
      duplicates: 0,
      missingWithinProbe: 0,
      samples: [{ tick: 64 }],
    },
    coverage: {
      fullTickDomain: false,
      authoritativeTickDomain: false,
      fullRawEvents: false,
      sampledEvents: true,
    },
    capabilities: CLIENT_PARSER_CAPABILITY_CATALOG,
    semanticStatus: "BLOCKED",
    performance: {
      fileSizeBytes: 42,
      hashDurationMs: 1,
      parseDurationMs: 2,
      totalDurationMs: 3,
      resultBytes: 1,
      workerStartupMs: 1,
      wasmLoadMs: 1,
      memory: { status: "UNAVAILABLE", usedBytes: null },
    },
    resultDigest: "",
  };
  value.resultDigest = computeClientResultDigest(value);
  return value;
}
function envelope() {
  const value = result();
  return { result: value, manifest: buildClientParserManifest(value) };
}
function resign(value: ReturnType<typeof envelope>) {
  value.result.resultDigest = computeClientResultDigest(value.result);
  value.manifest = buildClientParserManifest(value.result);
  return value;
}

function mutate(mutator: (value: ReturnType<typeof envelope>) => void) {
  const value = envelope();
  mutator(value);
  return value;
}

describe("client parser compact contract", () => {
  it("hashes actual bytes with lowercase SHA-256", () =>
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ));
  it("keeps deterministic digest independent from measurements", () => {
    const left = result();
    const right = { ...left, performance: { ...left.performance, totalDurationMs: 99 } };
    expect(computeClientResultDigest(left)).toBe(computeClientResultDigest(right));
  });
  it("keeps deterministic digest independent from local filename metadata", () => {
    const left = result();
    const right = {
      ...left,
      demo: { ...left.demo, name: "renamed.dem", lastModified: 999 },
    };
    expect(computeClientResultDigest(left)).toBe(computeClientResultDigest(right));
    expect(buildClientParserManifest(left).manifestDigest).toBe(
      buildClientParserManifest(right).manifestDigest,
    );
  });
  it("accepts a bounded untrusted envelope while keeping Canonical blocked", () =>
    expect(validateClientParserResult(envelope())).toEqual({
      accepted: true,
      trustLevel: "UNTRUSTED_CLIENT_RESULT_VALIDATED",
      canonicalAdmission: "BLOCKED",
      persisted: false,
    }));
  it.each([
    [
      "forged digest",
      mutate((v) => {
        v.result.resultDigest = "0".repeat(64);
      }),
    ],
    [
      "bad demo hash",
      resign(
        mutate((v) => {
          v.result.demo.sha256 = "bad";
        }),
      ),
    ],
    [
      "parser version",
      resign(
        mutate((v) => {
          (v.result.parser as { version: string }).version = "0.41.0";
        }),
      ),
    ],
    [
      "parser identity",
      resign(
        mutate((v) => {
          (v.result.parser as { buildIdentity: string }).buildIdentity = "forged";
        }),
      ),
    ],
    [
      "catalog digest",
      mutate((v) => {
        v.manifest.catalogDigest = "0".repeat(64);
      }),
    ],
    [
      "contract version",
      mutate((v) => {
        (v.manifest as { contractVersion: number }).contractVersion = 999;
      }),
    ],
    [
      "event sample bound",
      resign(
        mutate((v) => {
          v.result.selectedEventSamples = Array.from({ length: 1001 }, () => ({
            eventName: "x",
            tick: null,
            fields: {},
          }));
        }),
      ),
    ],
    [
      "tick probe bound",
      resign(
        mutate((v) => {
          v.result.tickProbe.requestedTickCount = 4097;
        }),
      ),
    ],
    [
      "full ticks",
      mutate((v) => {
        (v as unknown as Record<string, unknown>)["fullTicks"] = [];
      }),
    ],
    [
      "raw events",
      mutate((v) => {
        (v as unknown as Record<string, unknown>)["raw_events"] = [];
      }),
    ],
    [
      "demo bytes",
      mutate((v) => {
        (v as unknown as Record<string, unknown>)["demoBytes"] = [1, 2];
      }),
    ],
    [
      "typed buffer",
      mutate((v) => {
        (v as unknown as Record<string, unknown>)["bytes"] = new Uint8Array([1]);
      }),
    ],
    [
      "classification",
      resign(
        mutate((v) => {
          v.result.capabilities = v.result.capabilities.map((capability, index) =>
            index === 0 ? { ...capability, classification: "UNKNOWN" as "RAW_ONLY" } : capability,
          );
        }),
      ),
    ],
    ["missing result", { manifest: envelope().manifest }],
    ["wrong types", { result: "x", manifest: [] }],
  ])("rejects %s", (_name, value) =>
    expect(validateClientParserResult(value).accepted).toBe(false),
  );
  it("rejects abusive nested objects", () => {
    let nested: Record<string, unknown> = {};
    const value = nested;
    for (let i = 0; i < 14; i++) {
      nested["x"] = {};
      nested = nested["x"] as Record<string, unknown>;
    }
    expect(validateClientParserResult(value).accepted).toBe(false);
  });
  it("prepares exact client versus Python reference comparison", () => {
    const client = result();
    const reference = Object.fromEntries(
      [
        "header",
        "playerInventory",
        "eventDiscovery",
        "parsedEventInventory",
        "selectedEventSamples",
        "tickProbe",
        "capabilities",
        "coverage",
      ].map((key) => [key, client[key as keyof ClientParseResult]]),
    ) as Parameters<typeof compareClientVsServerReference>[1];
    expect(compareClientVsServerReference(client, reference)).toEqual({
      equal: true,
      mismatches: [],
    });
  });
  it("reports all semantic parity dimensions without hiding mismatches", () => {
    const report = compareClientVsPythonSemantic(
      { map: "de_cache", tickrate: 64 },
      { dimensions: { map: "de_cache", tickrate: 128, header: { map_name: "de_cache" } } },
      { player_identities: false },
    );
    expect(report).toHaveLength(22);
    expect(report.find((item) => item.dimension === "map")?.status).toBe("PASS");
    expect(report.find((item) => item.dimension === "tickrate")?.status).toBe("FAIL");
    expect(report.find((item) => item.dimension === "header")?.status).toBe("NOT_RUN");
    expect(report.find((item) => item.dimension === "player_identities")?.status).toBe(
      "NOT_AVAILABLE_ON_WASM",
    );
  });

  it("builds an individual fail-closed matrix when no real DEM is authorized", () => {
    const matrix = buildNotRunFieldMatrix();
    expect(matrix.length).toBeGreaterThan(100);
    expect(matrix.every((row) => row.status === "NOT_RUN")).toBe(true);
    expect(matrix.every((row) => row.canonicalEligible === false)).toBe(true);
    expect(matrix.some((row) => row.field === "map_name")).toBe(true);
    expect(matrix.some((row) => row.field === "dmg_health")).toBe(true);
    expect(matrix.some((row) => row.field === "balance")).toBe(true);
  });

  it("preserves null, type and value mismatches in field parity", () => {
    expect(
      compareFieldObservation({
        category: "ECONOMY",
        eventOrEntity: "tick_state",
        field: "balance",
        pythonAvailable: true,
        wasmExportAvailable: true,
        pythonParsed: true,
        wasmParsed: true,
        pythonValue: 0,
        wasmValue: null,
        evidenceRef: "same-dem",
      }).status,
    ).toBe("TYPE_MISMATCH");
    expect(
      compareFieldObservation({
        category: "HEADER",
        eventOrEntity: "header",
        field: "map_name",
        pythonAvailable: true,
        wasmExportAvailable: true,
        pythonParsed: true,
        wasmParsed: true,
        pythonValue: "de_cache",
        wasmValue: "de_mirage",
        evidenceRef: "same-dem",
      }).status,
    ).toBe("VALUE_MISMATCH");
  });

  it("does not claim determinism without two real runs per runtime", () => {
    expect(
      evaluateDeterminism({ demoSha256: null, pythonRunDigests: [], wasmRunDigests: [] }),
    ).toMatchObject({
      status: "NOT_RUN",
      reason: "NO_AUTHORIZED_REAL_DEM_FIXTURE",
    });
    expect(
      evaluateDeterminism({
        demoSha256: "b".repeat(64),
        pythonRunDigests: ["a", "a"],
        wasmRunDigests: ["c", "d"],
      }),
    ).toMatchObject({ status: "FAIL", pythonDeterministic: true, wasmDeterministic: false });
  });

  it("discovers the observed runtime surface instead of trusting declarations", () => {
    const surface = inspectRuntimeSurface({
      parseHeader() {},
      listGameEvents() {},
      parseEvent() {},
      parseTicks() {},
    });
    expect(surface.minimumReady).toBe(true);
    expect(surface.observedExports).toEqual([
      "listGameEvents",
      "parseEvent",
      "parseHeader",
      "parseTicks",
    ]);
    expect(
      capabilitiesForSurface(surface).find((item) => item.id === "parsePlayerInfo"),
    ).toMatchObject({
      available: false,
      classification: "UNAVAILABLE",
    });
  });

  it.each(CLIENT_REQUIRED_RUNTIME_EXPORTS)(
    "fails readiness when required export %s is absent",
    (missing) => {
      const runtime = Object.fromEntries(
        CLIENT_REQUIRED_RUNTIME_EXPORTS.filter((name) => name !== missing).map((name) => [
          name,
          () => {},
        ]),
      );
      expect(inspectRuntimeSurface(runtime).minimumReady).toBe(false);
    },
  );

  it.each(CLIENT_REQUIRED_RUNTIME_EXPORTS)(
    "rejects a result without successful call evidence for %s",
    (missing) => {
      const value = envelope();
      const call = value.result.parser.apiCalls.find((item) => item.api === missing);
      if (!call) throw new Error("fixture_call_missing");
      call.callSucceeded = false;
      call.status = "CALL_FAILED";
      resign(value);
      expect(validateClientParserResult(value)).toMatchObject({
        accepted: false,
        reasonCode: "CLIENT_CONTRACT_MISMATCH",
      });
    },
  );

  it("rejects a self-consistent but unknown WASM hash", () => {
    const value = envelope();
    value.result.parser.artifact.wasmBinarySha256 = "e".repeat(64);
    value.manifest.artifactProvenance.wasmBinarySha256 = "e".repeat(64);
    resign(value);
    expect(validateClientParserResult(value)).toMatchObject({
      accepted: false,
      reasonCode: "CLIENT_CONTRACT_MISMATCH",
    });
  });

  it("normalizes player inventory only through parsePlayerInfo", () => {
    const inventory = playerInventoryFromRuntime(
      {
        parsePlayerInfo: () => [{ steamid: 76561198000000000, name: "Player", team_number: 2 }],
      },
      new Uint8Array([1]),
    );
    expect(inventory).toEqual({
      status: "AVAILABLE",
      count: 1,
      players: [{ steamId: "76561198000000000", name: "Player", teamNumber: 2 }],
    });
    expect(playerInventoryFromRuntime({}, new Uint8Array([1])).status).toBe("UNAVAILABLE");
    expect(
      playerInventoryFromRuntime(
        {
          parsePlayerInfo: () => {
            throw new Error("parse failed");
          },
        },
        new Uint8Array([1]),
      ).status,
    ).toBe("PARSE_FAILED");
  });

  it("accepts only same-origin runtime assets", () => {
    expect(trustedRuntimeUrl("/wasm/parser.js", "https://gamepro.network/poc")).toBe(
      "https://gamepro.network/wasm/parser.js",
    );
    expect(
      trustedRuntimeUrl("https://evil.example/parser.js", "https://gamepro.network/poc"),
    ).toBeNull();
    expect(trustedRuntimeUrl("javascript:alert(1)", "https://gamepro.network/poc")).toBeNull();
  });

  it.each(["rawPayload", "raw_rows", "binary", "buffers"])(
    "rejects nested forbidden key %s",
    (key) => {
      const value = envelope();
      (value.result.header as Record<string, unknown>)["nested"] = { [key]: [] };
      expect(validateClientParserResult(value).accepted).toBe(false);
    },
  );

  it("rejects cycles, functions, ArrayBuffer and Blob", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(validateClientParserResult(cyclic).accepted).toBe(false);
    expect(validateClientParserResult({ value: () => true }).accepted).toBe(false);
    expect(validateClientParserResult({ value: new ArrayBuffer(1) }).accepted).toBe(false);
    expect(validateClientParserResult({ value: new Blob(["x"]) }).accepted).toBe(false);
  });

  it("changes manifest identity when a WASM binary hash changes", () => {
    const left = envelope();
    const changed = result();
    changed.parser.artifact = { ...changed.parser.artifact, wasmBinarySha256: "e".repeat(64) };
    changed.resultDigest = computeClientResultDigest(changed);
    const right = buildClientParserManifest(changed);
    expect(left.manifest.manifestDigest).not.toBe(right.manifestDigest);
  });

  it("rejects a forged manifest digest", () => {
    const value = envelope();
    value.manifest.manifestDigest = "0".repeat(64);
    expect(validateClientParserResult(value)).toMatchObject({
      accepted: false,
      reasonCode: "CLIENT_RESULT_DIGEST_MISMATCH",
    });
  });
  it.each([
    [
      "WASM hash",
      (v: ReturnType<typeof envelope>) =>
        (v.result.parser.artifact.wasmBinarySha256 = "e".repeat(64)),
    ],
    [
      "binding hash",
      (v: ReturnType<typeof envelope>) =>
        (v.result.parser.artifact.wasmBindingSha256 = "e".repeat(64)),
    ],
    [
      "source revision",
      (v: ReturnType<typeof envelope>) => (v.result.parser.artifact.sourceCommit = "e".repeat(40)),
    ],
    [
      "artifact status",
      (v: ReturnType<typeof envelope>) => (v.result.parser.artifact.status = "INVALID"),
    ],
    ["player inventory", (v: ReturnType<typeof envelope>) => (v.result.playerInventory.count = 99)],
    ["event inventory", (v: ReturnType<typeof envelope>) => (v.result.eventDiscovery.count = 99)],
    [
      "full tick claim",
      (v: ReturnType<typeof envelope>) =>
        ((v.result.coverage as { fullTickDomain: boolean }).fullTickDomain = true),
    ],
    [
      "authoritative tick claim",
      (v: ReturnType<typeof envelope>) =>
        ((v.result.coverage as { authoritativeTickDomain: boolean }).authoritativeTickDomain =
          true),
    ],
  ])("rejects forged %s", (_name, change) => {
    const value = envelope();
    change(value);
    expect(validateClientParserResult(value).accepted).toBe(false);
  });
});

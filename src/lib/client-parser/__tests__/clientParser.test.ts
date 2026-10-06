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
  normalizeForParity,
  summarizeFieldMatrix,
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
  CLIENT_PARSE_TIMEOUT_MS,
  type ClientParseResult,
} from "../clientParser.types";
import { validateClientParserResult } from "../clientParser.validator.server";
import { CLIENT_AUDIT_CATALOG_DIGEST, CLIENT_PARSER_CONTRACT_DIGEST } from "../clientParser.audit";
import {
  CLIENT_PARSER_CATALOG_VERSION,
  CLIENT_PARSER_CONTRACT_VERSION,
} from "../clientParser.types";

function parserMock() {
  return {
    listGameEvents: (_file: Uint8Array) => ["round_end"],
    listUpdatedFields: (_file: Uint8Array) => ["health"],
    parseHeader: (_file: Uint8Array) => ({ map_name: "de_cache", playback_ticks: 128 }),
    parseEvent: (_file: Uint8Array, _name?: string, _player?: unknown[], _other?: unknown[]) => [
      { tick: 64 },
    ],
    parseEvents: (
      _file: Uint8Array,
      _names?: unknown[],
      _player?: unknown[],
      _other?: unknown[],
    ) => [{ event_name: "round_end", tick: 64 }],
    parseGrenades: (_file: Uint8Array) => [],
    parseTicks: (...args: [Uint8Array, unknown[], Int32Array, unknown[], boolean]) => {
      if (args.length !== 5 || !Array.isArray(args[3]) || typeof args[4] !== "boolean")
        throw new Error("INVALID_WASM_TICK_SIGNATURE");
      return [{ tick: 64, health: 100 }];
    },
  };
}

it("mock rejects a struct-of-arrays flag in the wantedPlayers position", () => {
  const mock = parserMock();
  expect(mock.parseTicks(new Uint8Array(), ["health"], new Int32Array([64]), [], false)).toEqual([
    { tick: 64, health: 100 },
  ]);
  // Reflect deliberately bypasses compile-time arity to exercise malformed caller rejection.
  expect(() =>
    Reflect.apply(mock.parseTicks, mock, [new Uint8Array(), [], new Int32Array(), false]),
  ).toThrow("INVALID_WASM_TICK_SIGNATURE");
});

function result(): ClientParseResult {
  const value: ClientParseResult = {
    schemaVersion: CLIENT_PARSER_SCHEMA_VERSION,
    parser: {
      name: CLIENT_PARSER_NAME,
      version: CLIENT_PARSER_VERSION,
      runtime: CLIENT_PARSER_RUNTIME,
      buildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
      runtimeSurface: {
        observedExports: inspectRuntimeSurface(parserMock()).observedExports,
        minimumReady: true,
        runtimeSurfaceDigest: inspectRuntimeSurface(parserMock()).runtimeSurfaceDigest,
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
        eventName: null,
        requestedPlayerFields: [],
        requestedOtherFields: [],
        actualReturnedFields: [],
        missingRequestedFields: [],
        unexpectedReturnedFields: [],
        inputDigest: null,
        outputDigest: "c".repeat(64),
        evidenceRef: null,
        requestCatalogVersion: CLIENT_PARSER_CATALOG_VERSION,
        requestCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
        eventCatalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
        parserVersion: CLIENT_PARSER_VERSION,
        parserRevision: CLIENT_PARSER_ARTIFACT_PROVENANCE.sourceCommit ?? "",
        demoSha256: "b".repeat(64),
      })),
      artifact: {
        ...CLIENT_PARSER_ARTIFACT_PROVENANCE,
        bindingUrl: "https://example.test/pkg/demoparser2.js",
        wasmUrl: "https://example.test/pkg/demoparser2_bg.wasm",
      },
    },
    demo: {
      sha256: "b".repeat(64),
      sizeBytes: 42,
      name: "local.dem",
      lastModified: 1,
      authorization: {
        authorizedDemo: true,
        provenance: "LOCAL_USER_SELECTION",
        filename: "local.dem",
        sha256: "b".repeat(64),
        sizeBytes: 42,
        source: "LOCAL_FILE",
        authorizationRef: "local-selection:test",
        receivedAt: "2026-09-21T00:00:00.000Z",
      },
    },
    header: {
      values: { map_name: "de_cache" },
      evidence: [],
    },
    playerInventory: {
      status: "AVAILABLE",
      count: 1,
      players: [
        {
          steamId: "76561198000000000",
          name: "Player",
          internalSlot: null,
          userId: null,
          participantId: null,
          teamNumber: 2,
        },
      ],
    },
    eventDiscovery: {
      status: "AVAILABLE",
      discoveredEventsRaw: ["round_end"],
      discoveredEventCount: 1,
      discoveredEventNamesInOrder: ["round_end"],
      duplicateEventCount: 0,
      uniqueEventNames: ["round_end"],
      normalizedEventInventory: ["round_end"],
    },
    parsedEventInventory: [
      {
        name: "round_end",
        status: "PRESENT_AND_PARSED",
        count: 1,
        fields: ["tick"],
        requestedPlayerFields: [],
        requestedOtherFields: [],
        semanticStatus: "PASS",
      },
    ],
    selectedEventSamples: [{ eventName: "round_end", tick: 64, fields: { tick: 64 } }],
    grenadeEvidence: {
      status: "AVAILABLE",
      count: 1,
      samples: [
        {
          entity_id: 1,
          grenade_type: "smoke",
          name: "Player",
          steamid: "1",
          tick: 1,
          x: 0,
          y: 0,
          z: 0,
        },
      ],
      normalizedSamples: [
        {
          entity_id: 1,
          grenade_type: "smoke",
          name: "Player",
          steamid: "1",
          tick: 1,
          x: 0,
          y: 0,
          z: 0,
        },
      ],
      normalization: "RAW_ONLY",
      lifecycleStatus: "UNRESOLVED",
      normalizedDigest: "d".repeat(64),
      rawFieldInventory: ["entity_id", "grenade_type", "name", "steamid", "tick", "x", "y", "z"],
      semanticStatus: "PASS",
      evidenceRef: `grenades:${"d".repeat(64)}`,
    },
    roundEvidence: [],
    tickDomainEvidence: {
      source: "header_probe",
      provenance: "demoparser2.parseHeader+parseTicks",
      firstTick: 64,
      lastTick: 64,
      tickCount: 64,
      probeTicks: [64],
      probeType: "FIRST_MIDDLE_LAST",
      headerPlaybackTicks: 64,
      authoritativeDomain: false,
      domainEvidenceRef: `tick-probe:${"e".repeat(64)}`,
      coverageStatus: "PROBE_ONLY",
      authoritative: false,
      evidenceRef: `tick-probe:${"e".repeat(64)}`,
    },
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
  it("keeps a finite terminal timeout for an unresponsive Worker", () => {
    expect(CLIENT_PARSE_TIMEOUT_MS).toBe(300_000);
    expect(Number.isSafeInteger(CLIENT_PARSE_TIMEOUT_MS)).toBe(true);
  });
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
    [
      "missing API evidence digest",
      resign(
        mutate((v) => {
          const call = v.result.parser.apiCalls[0];
          if (!call) throw new Error("fixture_call_missing");
          call.normalizedDigest = null;
        }),
      ),
    ],
    [
      "negative API duration",
      resign(
        mutate((v) => {
          const call = v.result.parser.apiCalls[0];
          if (!call) throw new Error("fixture_call_missing");
          call.durationMs = -1;
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
    const summary = summarizeFieldMatrix(matrix);
    expect(matrix.length).toBeGreaterThan(100);
    expect(matrix.every((row) => row.status === "NOT_RUN")).toBe(true);
    expect(matrix.every((row) => row.canonicalEligible === false)).toBe(true);
    expect(matrix.some((row) => row.field === "map_name")).toBe(true);
    expect(matrix.some((row) => row.field === "dmg_health")).toBe(true);
    expect(matrix.some((row) => row.field === "balance")).toBe(true);
    expect(summary).toMatchObject({ total: matrix.length, notRun: matrix.length });
    expect(summary.blocked).toBe(matrix.length);
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
    ).toBe("SEMANTIC_MISMATCH");
  });

  it("preserves array order and duplicates while normalizing object keys", () => {
    expect(
      normalizeForParity([
        { z: 1, a: 2 },
        { a: 2, z: 1 },
        { z: 1, a: 2 },
      ]),
    ).toEqual([
      { a: 2, z: 1 },
      { a: 2, z: 1 },
      { a: 2, z: 1 },
    ]);
    expect(normalizeForParity(["b", "a", "b"])).toEqual(["b", "a", "b"]);
  });

  it("refuses to serialize non-finite numbers in deterministic evidence", () => {
    expect(() => computeClientResultDigest({ value: Number.NaN })).toThrow(
      "non_finite_number_is_not_serializable",
    );
  });

  it("does not claim determinism without two real runs per runtime", () => {
    expect(evaluateDeterminism({ demoSha256: null, runs: [] })).toMatchObject({
      status: "NOT_RUN",
      reason: "NO_AUTHORIZED_REAL_DEM_FIXTURE",
    });
    const run = (runtime: "PYTHON" | "WASM", runId: string, normalizedDigest: string) => ({
      runId,
      runtime,
      demoSha256: "b".repeat(64),
      parserIdentity: runtime === "PYTHON" ? "demoparser2-python" : "demoparser2-wasm",
      parserVersion: "0.42.0",
      parserRevision: "revision",
      artifactIdentity: runtime === "WASM" ? "artifact" : null,
      catalogVersion: CLIENT_PARSER_CATALOG_VERSION,
      catalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
      contractVersion: CLIENT_PARSER_CONTRACT_VERSION,
      contractDigest: CLIENT_PARSER_CONTRACT_DIGEST,
      normalizedDigest,
      startedAt: "2026-09-21T00:00:00.000Z",
      durationMs: 1,
      status: "SUCCEEDED" as const,
    });
    expect(
      evaluateDeterminism({
        demoSha256: "b".repeat(64),
        runs: [
          run("PYTHON", "python-1", "a".repeat(64)),
          run("PYTHON", "python-2", "a".repeat(64)),
          run("WASM", "wasm-1", "c".repeat(64)),
          run("WASM", "wasm-2", "d".repeat(64)),
        ],
      }),
    ).toMatchObject({ status: "FAIL", pythonDeterministic: true, wasmDeterministic: false });
  });

  it("fails determinism before comparison for duplicate run identities", () => {
    const run = (runtime: "PYTHON" | "WASM", runId: string) => ({
      runId,
      runtime,
      demoSha256: "b".repeat(64),
      parserIdentity: runtime === "PYTHON" ? "demoparser2-python" : "demoparser2-wasm",
      parserVersion: "0.42.0",
      parserRevision: "revision",
      artifactIdentity: runtime === "WASM" ? "artifact" : null,
      catalogVersion: CLIENT_PARSER_CATALOG_VERSION,
      catalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
      contractVersion: CLIENT_PARSER_CONTRACT_VERSION,
      contractDigest: CLIENT_PARSER_CONTRACT_DIGEST,
      normalizedDigest: "a".repeat(64),
      startedAt: "2026-09-21T00:00:00.000Z",
      durationMs: 1,
      status: "SUCCEEDED" as const,
    });
    expect(
      evaluateDeterminism({
        demoSha256: "b".repeat(64),
        runs: [
          run("PYTHON", "duplicate"),
          run("PYTHON", "duplicate"),
          run("WASM", "w1"),
          run("WASM", "w2"),
        ],
      }),
    ).toMatchObject({ status: "FAIL", reason: "DUPLICATE_RUN_IDENTITY" });
  });

  it("fails determinism before comparison for a catalog mismatch", () => {
    const run = (runtime: "PYTHON" | "WASM", runId: string) => ({
      runId,
      runtime,
      demoSha256: "b".repeat(64),
      parserIdentity: runtime === "PYTHON" ? "demoparser2-python" : "demoparser2-wasm",
      parserVersion: "0.42.0",
      parserRevision: "revision",
      artifactIdentity: runtime === "WASM" ? "artifact" : null,
      catalogVersion: CLIENT_PARSER_CATALOG_VERSION,
      catalogDigest: CLIENT_AUDIT_CATALOG_DIGEST,
      contractVersion: CLIENT_PARSER_CONTRACT_VERSION,
      contractDigest: CLIENT_PARSER_CONTRACT_DIGEST,
      normalizedDigest: "a".repeat(64),
      startedAt: "2026-09-21T00:00:00.000Z",
      durationMs: 1,
      status: "SUCCEEDED" as const,
    });
    const runs = [run("PYTHON", "p1"), run("PYTHON", "p2"), run("WASM", "w1"), run("WASM", "w2")];
    runs[0]!.catalogDigest = "0".repeat(64);
    expect(evaluateDeterminism({ demoSha256: "b".repeat(64), runs })).toMatchObject({
      status: "FAIL",
      reason: "CATALOG_MISMATCH",
    });
  });

  it.each([
    [null, "NULL_MATCH"],
    [0, "ZERO_MATCH"],
    [false, "FALSE_MATCH"],
    ["", "EMPTY_STRING_MATCH"],
  ])("preserves semantic equality for %p", (sample, status) => {
    expect(
      compareFieldObservation({
        category: "test",
        eventOrEntity: "test",
        field: "value",
        pythonAvailable: true,
        wasmExportAvailable: true,
        pythonParsed: true,
        wasmParsed: true,
        pythonValue: sample,
        wasmValue: sample,
        evidenceRef: "test",
      }).status,
    ).toBe(status);
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
      players: [
        {
          steamId: "76561198000000000",
          name: "Player",
          internalSlot: null,
          userId: null,
          participantId: null,
          teamNumber: 2,
        },
      ],
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

  it.each(["rawPayload", "raw_rows", "binary", "buffers", "constructor", "prototype"])(
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

  it.each([
    ["top-level", { value: Number.NaN }],
    ["nested", { value: { measurement: Number.POSITIVE_INFINITY } }],
    ["array", { value: [1, Number.NEGATIVE_INFINITY] }],
    ["deep", { value: { a: { b: { c: Number.NaN } } } }],
  ])("rejects non-finite numbers before JSON conversion: %s", (_name, value) => {
    expect(validateClientParserResult(value)).toMatchObject({
      accepted: false,
      reasonCode: "CLIENT_RESULT_INVALID",
      canonicalAdmission: "BLOCKED",
      persisted: false,
    });
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
    [
      "event inventory",
      (v: ReturnType<typeof envelope>) => (v.result.eventDiscovery.discoveredEventCount = 99),
    ],
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

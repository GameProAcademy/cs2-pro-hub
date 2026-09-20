import { describe, expect, it } from "vitest";
import { CLIENT_PARSER_CAPABILITY_CATALOG } from "../clientParser.capabilities";
import { computeClientResultDigest, sha256Text } from "../clientParser.hash";
import { buildClientParserManifest } from "../clientParser.manifest";
import { compareClientVsServerReference } from "../clientParser.parity";
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
      runtimeDigest: "a".repeat(64),
    },
    demo: { sha256: "b".repeat(64), sizeBytes: 42, name: "local.dem", lastModified: 1 },
    header: { map_name: "de_cache" },
    playerInventory: [{ steamId: "76561198000000000", name: "Player" }],
    eventInventory: [{ name: "round_end", count: 1, fields: ["tick"] }],
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
    },
    coverage: { fullTickDomain: false, fullRawEvents: false, sampledEvents: true },
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
        (v.manifest as { contractVersion: number }).contractVersion = 2;
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
            index === 0
              ? { ...capability, classification: "UNKNOWN" as "RAW_ONLY" }
              : capability,
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
        "eventInventory",
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
});

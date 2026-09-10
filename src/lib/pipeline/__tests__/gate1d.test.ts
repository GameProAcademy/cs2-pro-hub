import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PARSER_CONTRACT_VERSION,
  PARSER_NAME,
  PARSER_VERSION,
} from "@/config/pipeline";
import { DemoUploadError, precheckDemo } from "@/lib/pipeline/client";
import { assertRawParserOutput, expectedParserIdentity } from "@/lib/pipeline/parser/adapter";
import { resumableStorageEndpoint, TUS_CHUNK_BYTES } from "@/lib/pipeline/resumableUpload";

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: "application/octet-stream" });
}

afterEach(() => vi.unstubAllEnvs());

describe("Gate 1D upload boundaries", () => {
  it("accepts .dem and rejects extension and size violations", () => {
    expect(() => precheckDemo(file("match.dem", 64 * 1024))).not.toThrow();
    expect(() => precheckDemo(file("match.zip", 64 * 1024))).toThrowError(DemoUploadError);
    expect(() => precheckDemo(file("match.dem", 64 * 1024 - 1))).toThrowError("DEMO_TOO_SMALL");
    expect(() => precheckDemo(file("match.dem", 1_500 * 1024 * 1024 + 1))).toThrowError(
      "DEMO_TOO_LARGE",
    );
  });

  it("uses the official resumable endpoint and 6 MiB chunks", () => {
    expect(resumableStorageEndpoint("https://example.supabase.co")).toBe(
      "https://example.supabase.co/storage/v1/upload/resumable",
    );
    expect(TUS_CHUNK_BYTES).toBe(6 * 1024 * 1024);
    expect(() => resumableStorageEndpoint("http://example.supabase.co")).toThrow("STORAGE_ERROR");
  });
});

describe("Gate 1D parser identity", () => {
  const payload = () => ({
    parser: { name: PARSER_NAME, version: PARSER_VERSION, revision: "worker-revision" },
    contract_version: PARSER_CONTRACT_VERSION,
    header: { map: "de_mirage", tickrate: 64 },
    players: [],
    rounds: [],
    events: [],
  });

  it("defaults to demoparser2 0.42.0 and contract 1", () => {
    expect(expectedParserIdentity()).toEqual({
      name: "demoparser2",
      version: "0.42.0",
      revision: null,
    });
    expect(PARSER_CONTRACT_VERSION).toBe(1);
  });

  it("reads and enforces the configured revision", () => {
    vi.stubEnv("DEMO_PARSER_EXPECTED_REVISION", "worker-revision");
    expect(expectedParserIdentity().revision).toBe("worker-revision");
    expect(assertRawParserOutput(payload()).parser.revision).toBe("worker-revision");
    expect(() =>
      assertRawParserOutput({ ...payload(), parser: { ...payload().parser, revision: "other" } }),
    ).toThrow("PARSER_ERROR");
  });

  it("rejects wrong name, major/minor, contract, and missing arrays", () => {
    expect(() => assertRawParserOutput({ ...payload(), parser: { name: "other", version: "0.42.0" } })).toThrow();
    expect(() => assertRawParserOutput({ ...payload(), parser: { name: PARSER_NAME, version: "0.41.9" } })).toThrow();
    expect(() => assertRawParserOutput({ ...payload(), contract_version: 2 })).toThrow();
    const { events: _events, ...missingEvents } = payload();
    expect(() => assertRawParserOutput(missingEvents)).toThrow();
  });
});
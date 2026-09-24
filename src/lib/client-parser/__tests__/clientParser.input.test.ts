import { describe, expect, it } from "vitest";
import {
  CLIENT_DEMO_PARSER_CAPABILITY,
  isValidDemoParserCapability,
  readContiguousDemoInput,
} from "../clientParser.input";

describe("client parser input boundary", () => {
  it("declares the audited WASM runtime as contiguous and non-streaming", () => {
    expect(CLIENT_DEMO_PARSER_CAPABILITY).toMatchObject({
      parserName: "demoparser2",
      parserVersion: "0.42.0",
      inputCapability: "CONTIGUOUS_BUFFER",
      requiresContiguousBuffer: true,
      streamingSupported: false,
    });
    expect(isValidDemoParserCapability(CLIENT_DEMO_PARSER_CAPABILITY)).toBe(true);
  });

  it("rejects unknown or mismatched parser capabilities", () => {
    expect(
      isValidDemoParserCapability({
        ...CLIENT_DEMO_PARSER_CAPABILITY,
        inputCapability: "UNKNOWN",
      }),
    ).toBe(false);
    expect(
      isValidDemoParserCapability({ ...CLIENT_DEMO_PARSER_CAPABILITY, parserVersion: "invalid" }),
    ).toBe(false);
  });

  it("materializes an accepted File only at the adapter boundary", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "sample.dem");
    const input = await readContiguousDemoInput(file, CLIENT_DEMO_PARSER_CAPABILITY);
    expect([...input.bytes]).toEqual([1, 2, 3]);
    expect(input.buffer.byteLength).toBe(3);
  });
});

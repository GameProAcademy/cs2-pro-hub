import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { bindServerSecretsToProcessEnv } from "../serverRuntimeEnv";

describe("server runtime secret bindings", () => {
  const originalProcess = globalThis.process;

  beforeEach(() => {
    globalThis.process = { env: {} } as typeof globalThis.process;
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it("bridges only the two attestation bindings without exposing values", () => {
    bindServerSecretsToProcessEnv({
      PARSER_ATTESTATION_TRANSPORT_SECRET: "transport-secret-value",
      PARSER_ATTESTATION_HMAC_SECRET: "hmac-secret-value",
      UNRELATED_SECRET: "must-not-copy",
    });

    expect(globalThis.process.env.PARSER_ATTESTATION_TRANSPORT_SECRET).toBe("transport-secret-value");
    expect(globalThis.process.env.PARSER_ATTESTATION_HMAC_SECRET).toBe("hmac-secret-value");
    expect(globalThis.process.env.UNRELATED_SECRET).toBeUndefined();
  });

  it("ignores missing, non-string, and empty bindings without throwing", () => {
    expect(() =>
      bindServerSecretsToProcessEnv({
        PARSER_ATTESTATION_TRANSPORT_SECRET: "",
        PARSER_ATTESTATION_HMAC_SECRET: 123,
      }),
    ).not.toThrow();

    expect(globalThis.process.env.PARSER_ATTESTATION_TRANSPORT_SECRET).toBeUndefined();
    expect(globalThis.process.env.PARSER_ATTESTATION_HMAC_SECRET).toBeUndefined();
  });

  it("does nothing when fetch env is absent", () => {
    expect(() => bindServerSecretsToProcessEnv(undefined)).not.toThrow();
    expect(globalThis.process.env).toEqual({});
  });
});

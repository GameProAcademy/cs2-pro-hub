import { afterEach, describe, expect, it } from "vitest";

import { bindAttestationRuntimeSecrets } from "./server";

const TRANSPORT_NAME = "PARSER_ATTESTATION_TRANSPORT_SECRET";
const HMAC_NAME = "PARSER_ATTESTATION_HMAC_SECRET";
const originalTransport = process.env[TRANSPORT_NAME];
const originalHmac = process.env[HMAC_NAME];

afterEach(() => {
  if (originalTransport === undefined) delete process.env[TRANSPORT_NAME];
  else process.env[TRANSPORT_NAME] = originalTransport;
  if (originalHmac === undefined) delete process.env[HMAC_NAME];
  else process.env[HMAC_NAME] = originalHmac;
});

describe("attestation runtime secret bindings", () => {
  it("copies only the two named server bindings into process.env", () => {
    bindAttestationRuntimeSecrets({
      [TRANSPORT_NAME]: "t".repeat(32),
      [HMAC_NAME]: "h".repeat(32),
      UNRELATED_SECRET: "must-not-be-copied",
    });

    expect(process.env[TRANSPORT_NAME]).toBe("t".repeat(32));
    expect(process.env[HMAC_NAME]).toBe("h".repeat(32));
    expect(process.env["UNRELATED_SECRET"]).toBeUndefined();
  });

  it("does not serialize, return, or log secret material", () => {
    const log = console.log;
    const error = console.error;
    const logs: unknown[][] = [];
    console.log = (...args: unknown[]) => logs.push(args);
    console.error = (...args: unknown[]) => logs.push(args);
    try {
      const result = bindAttestationRuntimeSecrets({
        [TRANSPORT_NAME]: "transport-material-not-for-output",
        [HMAC_NAME]: "signing-material-not-for-output",
      });
      expect(result).toBeUndefined();
      expect(logs).toEqual([]);
    } finally {
      console.log = log;
      console.error = error;
    }
  });

  it("ignores absent and non-string bindings so the route remains fail-closed", () => {
    delete process.env[TRANSPORT_NAME];
    delete process.env[HMAC_NAME];

    bindAttestationRuntimeSecrets({
      [TRANSPORT_NAME]: undefined,
      [HMAC_NAME]: { invalid: true },
    });

    expect(process.env[TRANSPORT_NAME]).toBeUndefined();
    expect(process.env[HMAC_NAME]).toBeUndefined();
  });
});

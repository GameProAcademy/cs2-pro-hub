import { describe, expect, it } from "vitest";

import { isAttestationTransportAuthorized } from "../parserAttestationCrypto.server";

const SECRET = "test-transport-secret-0123456789abcdef";

describe("isAttestationTransportAuthorized", () => {
  it("accepts the normal Authorization bearer transport", () => {
    const headers = new Headers({
      authorization: `Bearer ${SECRET}`,
    });

    expect(isAttestationTransportAuthorized(headers, SECRET)).toBe(true);
  });

  it("accepts the dedicated fallback transport header", () => {
    const headers = new Headers({
      "x-parser-attestation-transport": SECRET,
    });

    expect(isAttestationTransportAuthorized(headers, SECRET)).toBe(true);
  });

  it("rejects missing transport credentials", () => {
    expect(isAttestationTransportAuthorized(new Headers(), SECRET)).toBe(false);
  });

  it("rejects an incorrect bearer and incorrect fallback", () => {
    const headers = new Headers({
      authorization: "Bearer wrong-secret",
      "x-parser-attestation-transport": "wrong-secret",
    });

    expect(isAttestationTransportAuthorized(headers, SECRET)).toBe(false);
  });

  it("rejects partially matching fallback values", () => {
    const headers = new Headers({
      "x-parser-attestation-transport": `${SECRET}-extra`,
    });

    expect(isAttestationTransportAuthorized(headers, SECRET)).toBe(false);
  });
});

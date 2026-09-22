import { describe, expect, it } from "vitest";

import {
  canonicalAttestationJson,
  safeAttestationEqual,
  signAttestationPayload,
} from "@/lib/parserAttestationCrypto.server";

describe("parser attestation HMAC contract", () => {
  const secret = "s".repeat(32);

  it("canonicalizes equivalent payloads identically", () => {
    expect(canonicalAttestationJson({ b: 2, a: { z: false, x: null } })).toBe(
      canonicalAttestationJson({ a: { x: null, z: false }, b: 2 }),
    );
  });

  it("rejects payload tampering and malformed signatures", () => {
    const canonical = canonicalAttestationJson({ status: "BLOCKED", count: 0 });
    const signature = signAttestationPayload(canonical, secret);
    const tampered = signAttestationPayload(
      canonicalAttestationJson({ status: "VERIFIED", count: 0 }),
      secret,
    );
    expect(safeAttestationEqual(signature, tampered)).toBe(false);
    expect(safeAttestationEqual(signature, signature.slice(2))).toBe(false);
    expect(safeAttestationEqual(signature, "g".repeat(64))).toBe(false);
  });
});
/**
 * Phase 2.1.2.1 — proofs for the six surgical corrections.
 */
import { describe, expect, it } from "vitest";

import { coverageFromSamples, coverageRatio } from "../capabilities";
import { provenanceToMatchColumns, type SourceProvenance } from "../adapter";
import {
  assertSafeConnectionMetadata,
  isSensitiveMetadataKey,
  validateConnectionMetadata,
} from "../connectionMetadata";

describe("coverage semantics (zero is an observation)", () => {
  it("treats an observed zero as available data", () => {
    const coverage = coverageFromSamples({ utility: 0, flash_assists: 0 });
    expect(coverage.utility).toBe("available");
    expect(coverage.flash_assists).toBe("available");
  });

  it("keeps null and undefined as unavailable", () => {
    const coverage = coverageFromSamples({ utility: null, economy: undefined });
    expect(coverage.utility).toBe("unavailable");
    expect(coverage.economy).toBe("unavailable");
    expect(coverage.positioning).toBe("unavailable");
  });

  it("does not confuse a zero sample with a missing signal in the ratio", () => {
    const zeros = coverageFromSamples({ utility: 0 });
    const missing = coverageFromSamples({ utility: null });
    expect(coverageRatio(zeros)).toBeGreaterThan(coverageRatio(missing));
  });

  it("still marks a small positive sample as partial", () => {
    expect(coverageFromSamples({ clutches: 1 }, { clutches: 3 }).clutches).toBe("partial");
  });

  it("treats NaN as missing, never as zero", () => {
    expect(coverageFromSamples({ adr: Number.NaN }).adr).toBe("unavailable");
  });
});

describe("provenance contract maps onto the real columns", () => {
  it("uses external_match_id as the source record id", () => {
    const provenance: SourceProvenance = {
      source: "faceit",
      sourceRecordId: "1-abc",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      sourceVersion: "v4",
    };
    expect(provenanceToMatchColumns(provenance)).toEqual({
      data_source: "faceit",
      external_match_id: "1-abc",
      source_fetched_at: "2026-01-01T00:00:00.000Z",
      source_version: "v4",
    });
  });

  it("never invents an identifier when the source has none", () => {
    expect(
      provenanceToMatchColumns({
        source: "demo",
        sourceRecordId: null,
        fetchedAt: null,
        sourceVersion: null,
      }).external_match_id,
    ).toBeNull();
  });
});

describe("connection metadata cannot become a credential store", () => {
  it("detects sensitive keys regardless of case and separators", () => {
    for (const key of [
      "access_token",
      "refreshToken",
      "API-KEY",
      "Authorization",
      "Cookie",
      "client_secret",
      "user password",
      "JWT",
      "privateKey",
    ]) {
      expect(isSensitiveMetadataKey(key)).toBe(true);
    }
  });

  it("accepts harmless descriptive keys", () => {
    for (const key of ["nickname", "profileUrl", "region", "requestedAt", "public_id"]) {
      expect(isSensitiveMetadataKey(key)).toBe(false);
    }
    expect(validateConnectionMetadata({ nickname: "x", region: "eu" }).ok).toBe(true);
    expect(validateConnectionMetadata(null).ok).toBe(true);
  });

  it("rejects sensitive keys nested at any depth", () => {
    const result = validateConnectionMetadata({
      profile: { oauth: [{ Access_Token: "abc" }] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sensitive_key");
  });

  it("rejects non-object metadata", () => {
    expect(validateConnectionMetadata("token").ok).toBe(false);
    expect(validateConnectionMetadata([1, 2]).ok).toBe(false);
  });

  it("throws with a stable code on the server path", () => {
    expect(() => assertSafeConnectionMetadata({ refresh_token: "x" })).toThrow(
      "CONNECTION_METADATA_SENSITIVE",
    );
    expect(() => assertSafeConnectionMetadata("nope")).toThrow("CONNECTION_METADATA_INVALID");
    expect(() => assertSafeConnectionMetadata({ nickname: "ok" })).not.toThrow();
  });
});

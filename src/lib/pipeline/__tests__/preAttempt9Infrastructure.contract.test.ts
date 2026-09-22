import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260922081136_4be12bdc-b7f7-425f-b7a2-862834bf49ce.sql"),
  "utf8",
);

describe("C.7-C.10 pre-Attempt-9 infrastructure", () => {
  it("keeps attestation nonces private, immutable and replay-rejecting", () => {
    expect(migration).toContain("nonce text PRIMARY KEY");
    expect(migration).toContain("attestation_digest text NOT NULL UNIQUE");
    expect(migration).toContain("parser_attestation_nonces_immutable");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES");
  });

  it("keeps mapping authorization fail-closed for generic and unverified sources", () => {
    expect(migration).toContain("'derived_or_constant','generic','unknown','*','all'");
    expect(migration).toContain("NOT canonical_authorization");
    expect(migration).toContain("CANONICAL_MAPPING_GATE_BLOCKED");
  });

  it("produces NOT_RUN parity and determinism reports without a DEM", () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepro-pre-attempt-9-"));
    const parity = join(directory, "parity.json");
    const determinism = join(directory, "determinism.json");
    try {
      execFileSync("node", ["scripts/run_python_wasm_parity.mjs", "--output", parity]);
    } catch {
      // NOT_RUN intentionally exits non-zero so CI cannot mistake it for proof.
    }
    try {
      execFileSync("node", ["scripts/run_parser_determinism.mjs", "--output", determinism]);
    } catch {
      // NOT_RUN intentionally exits non-zero so CI cannot mistake it for proof.
    }
    expect(JSON.parse(readFileSync(parity, "utf8"))).toMatchObject({
      status: "NOT_RUN",
      canonical_authorization: false,
    });
    expect(JSON.parse(readFileSync(determinism, "utf8"))).toMatchObject({
      status: "NOT_RUN",
      canonical_authorization: false,
    });
  });
});
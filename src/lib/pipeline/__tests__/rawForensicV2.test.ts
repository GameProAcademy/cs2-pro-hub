import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  auditPhysicalRawChunks,
  reconcileProducerAndPhysical,
} from "@/lib/pipeline/rawArtifact.server";
import {
  RAW_FORENSIC_V2_REQUIRED_GATES,
  RAW_FORENSIC_RECONCILIATION_DIMENSIONS,
  rawArtifactBytesSha256,
  rawArtifactSha256,
  resolveRawForensicPhysicalGate,
  stableRawArtifactJson,
  validateRawForensicContractV2,
} from "@/lib/pipeline/rawArtifactContract";

function contract() {
  const value = {
    audit_contract_version: 2,
    parser: { name: "demoparser2", version: "0.42.0" },
    capability_catalog: { catalog_digest: "c".repeat(64) },
    capability_reconciliation: {
      status: "PASS",
      unresolved_count: 0,
      duplicate_count: 0,
      orphan_count: 0,
      set_difference_count: 0,
    },
    full_tick_audit: {
      coverage: "FULL_TICK_DOMAIN_AUDIT",
      domain_proof_status: "PASS",
      complete: true,
      tick_domain_source: { authoritative: true },
      full_tick_domain_proof: { status: "PASS", complete: true },
    },
    property_inventory: [{}],
    event_inventory: [{}],
    semantic_inventories: {},
    mapping_inventory: [
      {
        raw_field: "header.map_name",
        status: "CANONICAL",
        app_field: "header.map",
        canonical_field: "CanonicalMatch.map",
      },
    ],
    gates: RAW_FORENSIC_V2_REQUIRED_GATES.map((gate) => ({
      gate,
      status: gate === "RAW-V2-22-physical-reaudit" ? "BLOCKED" : "PASS",
      reasons: [],
    })),
    physical_reaudit_required: true,
    producer_gate_status: "PASS",
    physical_gate_status: "PENDING",
    final_gate_status: "BLOCKED",
    canonical_admission: "BLOCKED",
    catalog_digest: "c".repeat(64),
    tick_authority_digest: "t".repeat(64),
    unsigned_contract_digest: "",
    deterministic_digest: "",
  };
  const fullTickAudit = value.full_tick_audit as Record<string, unknown>;
  fullTickAudit["tick_domain_source"] = { authoritative: true, digest: "t".repeat(64) };
  const digest = rawArtifactSha256(
    stableRawArtifactJson(
      Object.fromEntries(
        Object.entries(value).filter(
          ([key]) =>
            key !== "deterministic_digest" &&
            key !== "unsigned_contract_digest" &&
            key !== "final_contract_digest",
        ),
      ),
    ),
  );
  value.unsigned_contract_digest = digest;
  value.deterministic_digest = digest;
  return value;
}

describe("RAW forensic contract v2", () => {
  it("requires the exact parser, exhaustive tick proof, inventories, mappings and 22 gates", () => {
    expect(validateRawForensicContractV2(contract())).toEqual([]);
    expect(
      validateRawForensicContractV2({
        ...contract(),
        full_tick_audit: { coverage: "SAMPLE", complete: false },
      }),
    ).toContain("forensic_v2_full_tick_unproven");
  });

  it("rejects legacy unmapped classifications from v2", () => {
    expect(
      validateRawForensicContractV2({
        ...contract(),
        mapping_inventory: [{ raw_field: "x", status: "UNMAPPED_BUT_AVAILABLE" }],
      }),
    ).toContain("forensic_v2_mapping_invalid");
  });

  it("resolves Gate 22 only after reconciliation and validates the final decision", () => {
    const resolved = resolveRawForensicPhysicalGate(contract(), {
      reconciliationDigest: "b".repeat(64),
      artifactRootDigest: "d".repeat(64),
      dimensions: Object.fromEntries(
        RAW_FORENSIC_RECONCILIATION_DIMENSIONS.map((name) => [name, "PASS" as const]),
      ),
    });
    expect(resolved["physical_gate_status"]).toBe("PASS");
    expect(resolved["final_gate_status"]).toBe("PASS");
    expect(resolved["canonical_admission"]).toBe("APPROVED");
    expect(validateRawForensicContractV2(resolved, "final")).toEqual([]);
  });

  it("fails set reconciliation on missing, extra or different semantic evidence", () => {
    const base = { event_inventory: ["player_death"], event_counts: { player_death: 1 } };
    const producer = {
      ...base,
      digest: rawArtifactSha256(stableRawArtifactJson(base)),
    };
    const pass = reconcileProducerAndPhysical(producer, producer);
    expect(pass["status"]).toBe("PASS");
    const fail = reconcileProducerAndPhysical(producer, {
      event_inventory: ["player_hurt"],
      event_counts: { player_hurt: 1 },
      extra: true,
      digest: "0".repeat(64),
    });
    expect(fail).toMatchObject({ status: "FAIL", extra_in_artifact: ["extra"] });
    expect(fail["different_in_artifact"]).toEqual(["event_counts", "event_inventory"]);
  });

  it("independently downloads, hashes, decompresses and inventories every chunk", async () => {
    const bytes = gzipSync(Buffer.from('{"tick":1,"health":100}\n{"tick":2,"health":0}\n'));
    const physical = await auditPhysicalRawChunks({
      bucket: "cs2-raw-evidence",
      prefix: "u/up/attempt-1",
      chunks: [
        {
          section: "ticks",
          chunk_index: 0,
          row_count: 2,
          byte_size: bytes.byteLength,
          sha256: rawArtifactBytesSha256(bytes),
          storage_path: "u/up/attempt-1/ticks/0.gz",
        },
      ],
      download: async () => new Blob([bytes]),
    });
    expect(physical).toMatchObject({
      total_chunks: 1,
      total_rows: 2,
      total_bytes: bytes.byteLength,
    });
    expect(physical["sections"]).toMatchObject({
      ticks: { rows: 2, bytes: bytes.byteLength, fields: ["health", "tick"] },
    });
  });

  it("fails closed on physical byte mutation", async () => {
    const bytes = gzipSync(Buffer.from('{"tick":1}\n'));
    await expect(
      auditPhysicalRawChunks({
        bucket: "cs2-raw-evidence",
        prefix: "u/up/attempt-1",
        chunks: [
          {
            section: "ticks",
            chunk_index: 0,
            row_count: 1,
            byte_size: bytes.byteLength,
            sha256: "0".repeat(64),
            storage_path: "u/up/attempt-1/ticks/0.gz",
          },
        ],
        download: async () => new Blob([bytes]),
      }),
    ).rejects.toMatchObject({
      code: "PARSER_INVALID_RESPONSE",
      detail: "RAW physical chunk digest mismatch",
    });
  });
});

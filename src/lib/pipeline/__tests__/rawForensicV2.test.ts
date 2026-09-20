import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { auditPhysicalRawChunks } from "@/lib/pipeline/rawArtifact.server";
import {
  RAW_FORENSIC_V2_REQUIRED_GATES,
  rawArtifactBytesSha256,
  validateRawForensicContractV2,
} from "@/lib/pipeline/rawArtifactContract";

function contract() {
  return {
    audit_contract_version: 2,
    parser: { name: "demoparser2", version: "0.42.0" },
    capability_catalog: {},
    full_tick_audit: { coverage: "FULL_TICK_DOMAIN_AUDIT", complete: true },
    property_inventory: [{}],
    event_inventory: [{}],
    semantic_inventories: {},
    mapping_inventory: [{ raw_field: "header.map_name", status: "CANONICAL" }],
    gates: RAW_FORENSIC_V2_REQUIRED_GATES.map((gate) => ({
      gate,
      status: gate === "RAW-V2-22-physical-reaudit" ? "BLOCKED" : "PASS",
      reasons: [],
    })),
    physical_reaudit_required: true,
    canonical_admission: "BLOCKED",
    deterministic_digest: "a".repeat(64),
  };
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
    expect(physical).toMatchObject({ total_chunks: 1, total_rows: 2, total_bytes: bytes.byteLength });
    expect(physical.sections).toEqual({
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
    ).rejects.toThrow("digest mismatch");
  });
});
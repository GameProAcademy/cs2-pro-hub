import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  auditPhysicalRawChunks,
  decodeRawPhysicalChunkSummary,
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

  it("rejects forged digests and incomplete named reconciliation dimensions", () => {
    expect(
      validateRawForensicContractV2({ ...contract(), deterministic_digest: "0".repeat(64) }),
    ).toContain("forensic_v2_contract_digest_invalid");
    expect(() =>
      resolveRawForensicPhysicalGate(contract(), {
        reconciliationDigest: "b".repeat(64),
        artifactRootDigest: "d".repeat(64),
        dimensions: Object.fromEntries(
          RAW_FORENSIC_RECONCILIATION_DIMENSIONS.map((name) => [
            name,
            name === "tick_domain" ? "FAIL" : "PASS",
          ]),
        ),
      }),
    ).toThrow("forensic_v2_reconciliation_dimensions_invalid");
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

  it("rejects traversal and sibling-prefix chunk paths before downloading", async () => {
    for (const path of ["u/up/attempt-1/../secret.gz", "u/up/attempt-10/ticks/0.gz"]) {
      await expect(
        auditPhysicalRawChunks({
          bucket: "cs2-raw-evidence",
          prefix: "u/up/attempt-1",
          chunks: [
            {
              section: "ticks",
              chunk_index: 0,
              row_count: 1,
              byte_size: 1,
              sha256: "0".repeat(64),
              storage_path: path,
            },
          ],
          download: async () => new Blob(),
        }),
      ).rejects.toMatchObject({ detail: "RAW chunk path escaped artifact prefix" });
    }
  });

  describe("per-chunk physical decode recorded at verification (2dc1ddd1 CPU limit)", () => {
    const prefix = "u/up/attempt-1";
    const sections: Record<string, string[]> = {
      header: [JSON.stringify({ map_name: "de_cache", tickrate: 64 })],
      players: [
        JSON.stringify({ steamid: "76561198000000001", name: "a" }),
        JSON.stringify({ steamid: "76561198000000002", name: "b" }),
      ],
      rounds: [JSON.stringify({ number: 1, winner: "CT" }), JSON.stringify({ number: 2 })],
      events: [
        JSON.stringify({ event_name: "player_death", tick: 10, raw_fields: { weapon: "ak47" } }),
        JSON.stringify({ event_name: "player_death", tick: 20, raw_fields: { headshot: true } }),
        JSON.stringify({ event_name: "round_end", tick: 30 }),
      ],
      ticks: [JSON.stringify({ tick: 1, health: 100 }), JSON.stringify({ tick: 2, health: 90 })],
      grenades: Array.from({ length: 50 }, (_, i) =>
        JSON.stringify({ entity_id: i, grenade_type: "smoke", tick: 100 + i, X: i, Y: 1, Z: 2 }),
      ),
      forensic: [JSON.stringify({ field_mappings: [], forensic_contract_v2: {} })],
    };
    function artifact() {
      const store = new Map<string, Uint8Array<ArrayBuffer>>();
      const chunks = Object.entries(sections).flatMap(([section, lines]) => {
        // Two chunks for the large section, one elsewhere.
        const parts = section === "grenades" ? [lines.slice(0, 25), lines.slice(25)] : [lines];
        return parts.map((part, index) => {
          const bytes = new Uint8Array(gzipSync(Buffer.from(part.join("\n") + "\n")));
          const storage_path = `${prefix}/${section}/chunk-${index}.jsonl.gz`;
          store.set(storage_path, bytes);
          return {
            section,
            chunk_index: index,
            row_count: part.length,
            byte_size: bytes.byteLength,
            sha256: rawArtifactBytesSha256(bytes),
            storage_path,
          };
        });
      });
      return { store, chunks };
    }
    async function withSummaries(
      chunks: ReturnType<typeof artifact>["chunks"],
      store: Map<string, Uint8Array<ArrayBuffer>>,
    ) {
      return Promise.all(
        chunks.map(async (chunk) =>
          ["forensic", "header"].includes(chunk.section)
            ? chunk
            : {
                ...chunk,
                physical_summary: await decodeRawPhysicalChunkSummary({
                  bytes: store.get(chunk.storage_path)!,
                  section: chunk.section,
                  sha256: chunk.sha256,
                  rowCount: chunk.row_count,
                }),
              },
        ),
      );
    }

    it("produces exactly the same audit as a full re-decode at completion", async () => {
      const { store, chunks } = artifact();
      const download = async (path: string) => new Blob([store.get(path)!]);
      const full = await auditPhysicalRawChunks({ bucket: "b", prefix, chunks, download });
      const summarized = await auditPhysicalRawChunks({
        bucket: "b",
        prefix,
        chunks: await withSummaries(chunks, store),
        download,
      });
      expect(summarized).toEqual(full);
      expect(full["total_rows"]).toBe(61);
    });

    it("still re-hashes every object at completion and never decodes a summarized chunk again", async () => {
      const { store, chunks } = artifact();
      const summarized = await withSummaries(chunks, store);
      const target = summarized.find((chunk) => chunk.section === "grenades")!;
      // Same bytes, same digest: completion accepts the recorded decode without gunzip.
      const downloads: string[] = [];
      await auditPhysicalRawChunks({
        bucket: "b",
        prefix,
        chunks: summarized,
        download: async (path) => {
          downloads.push(path);
          return new Blob([store.get(path)!]);
        },
      });
      expect(downloads.sort()).toEqual(chunks.map((chunk) => chunk.storage_path).sort());
      // Mutated object: the digest check still fails closed before the summary is used.
      const mutated = new Uint8Array(store.get(target.storage_path)!);
      mutated[mutated.length - 1] = (mutated[mutated.length - 1] ?? 0) ^ 0xff;
      await expect(
        auditPhysicalRawChunks({
          bucket: "b",
          prefix,
          chunks: summarized,
          download: async (path) =>
            new Blob([path === target.storage_path ? mutated : store.get(path)!]),
        }),
      ).rejects.toMatchObject({ detail: "RAW physical chunk digest mismatch" });
    });

    it("refuses a summary recorded for other bytes, rows or section", async () => {
      const { store, chunks } = artifact();
      const summarized = await withSummaries(chunks, store);
      const download = async (path: string) => new Blob([store.get(path)!]);
      const index = summarized.findIndex((chunk) => chunk.section === "grenades");
      const original = summarized[index] as (typeof summarized)[number] & {
        physical_summary: Record<string, unknown>;
      };
      for (const tamper of [
        { chunk_sha256: "0".repeat(64) },
        { rows: original.row_count + 1 },
        { section: "ticks" },
        { version: 2 },
        { event_counts: { player_death: 1 }, event_fields: {} },
        { tick_values: ["1"] },
      ]) {
        const chunksTampered = summarized.map((chunk, i) =>
          i === index
            ? { ...chunk, physical_summary: { ...original.physical_summary, ...tamper } }
            : chunk,
        );
        await expect(
          auditPhysicalRawChunks({ bucket: "b", prefix, chunks: chunksTampered, download }),
        ).rejects.toMatchObject({ detail: "RAW physical chunk summary invalid" });
      }
    });

    it("always decodes forensic and header chunks again, ignoring any summary", async () => {
      const { store, chunks } = artifact();
      const download = async (path: string) => new Blob([store.get(path)!]);
      const full = await auditPhysicalRawChunks({ bucket: "b", prefix, chunks, download });
      const forged = chunks.map((chunk) =>
        ["forensic", "header"].includes(chunk.section)
          ? { ...chunk, physical_summary: { version: 1, forged: true } }
          : chunk,
      );
      expect(
        await auditPhysicalRawChunks({ bucket: "b", prefix, chunks: forged, download }),
      ).toEqual(full);
    });

    it("verification-time decode fails closed on digest, row count and re-decoded sections", async () => {
      const { store, chunks } = artifact();
      const grenades = chunks.find((chunk) => chunk.section === "grenades")!;
      const bytes = store.get(grenades.storage_path)!;
      await expect(
        decodeRawPhysicalChunkSummary({
          bytes,
          section: "grenades",
          sha256: "0".repeat(64),
          rowCount: grenades.row_count,
        }),
      ).rejects.toMatchObject({ detail: "RAW physical chunk digest mismatch" });
      await expect(
        decodeRawPhysicalChunkSummary({
          bytes,
          section: "grenades",
          sha256: grenades.sha256,
          rowCount: grenades.row_count + 1,
        }),
      ).rejects.toMatchObject({ detail: "RAW physical chunk row count mismatch" });
      const forensic = chunks.find((chunk) => chunk.section === "forensic")!;
      await expect(
        decodeRawPhysicalChunkSummary({
          bytes: store.get(forensic.storage_path)!,
          section: "forensic",
          sha256: forensic.sha256,
          rowCount: 1,
        }),
      ).rejects.toMatchObject({ detail: "RAW section is decoded at completion" });
    });
  });
});

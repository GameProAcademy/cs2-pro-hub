import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DemoUploadError,
  submitDemoWithDependencies,
  type SubmitDemoDependencies,
} from "@/lib/pipeline/client";
import { isPermanentError, PipelineError } from "@/lib/pipeline/errors";
import {
  assertDemoContentNotQuarantined,
  isDemoContentQuarantined,
} from "@/lib/pipeline/quarantine.server";

/**
 * D17 (production job b7579762, 2026-10-21): the reference DEM 0caa7c97 maps to the
 * quarantined pre-provenance match a7b27f16 (content-addressed Canonical), so persistence
 * is refused with CANONICAL_MATCH_QUARANTINED. The job was retried three times (three full
 * 4.59M-row parses) because the failure was classified as transient.
 */

type Row = Record<string, unknown> | null;
function fakeDb(tables: { matches?: Row; quarantine?: Row; failOn?: "matches" | "quarantine" }) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(table);
      const key = table === "matches" ? "matches" : "quarantine";
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              tables.failOn === key
                ? { data: null, error: { message: "boom" } }
                : { data: tables[key] ?? null, error: null },
          }),
        }),
      };
    },
  };
  return { db: db as never, calls };
}

const SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d";

describe("quarantined demo content", () => {
  it("is a permanent pipeline failure (never retried)", () => {
    expect(isPermanentError("CANONICAL_MATCH_QUARANTINED")).toBe(true);
    expect(new PipelineError("CANONICAL_MATCH_QUARANTINED").permanent).toBe(true);
    // A generic persistence failure stays transient.
    expect(isPermanentError("CANONICAL_PERSISTENCE_ERROR")).toBe(false);
  });

  it("maps the database refusal to the permanent code at the persistence boundary", () => {
    const source = readFileSync(resolve("src/lib/pipeline/jobs.server.ts"), "utf8");
    expect(source).toContain('detail?.includes("CANONICAL_MATCH_QUARANTINED")');
    expect(source).toMatch(
      /\? "CANONICAL_MATCH_QUARANTINED"\s*:\s*detail\?\.toLowerCase\(\)\.includes\("conflict"\)/,
    );
  });

  it("detects content whose Canonical match is quarantined", async () => {
    expect(await isDemoContentQuarantined(fakeDb({}).db, SHA)).toBe(false);
    expect(await isDemoContentQuarantined(fakeDb({ matches: { id: "m1" } }).db, SHA)).toBe(false);
    const quarantined = fakeDb({ matches: { id: "m1" }, quarantine: { match_id: "m1" } });
    expect(await isDemoContentQuarantined(quarantined.db, SHA)).toBe(true);
    expect(quarantined.calls).toEqual(["matches", "canonical_match_quarantine"]);
    await expect(assertDemoContentNotQuarantined(quarantined.db, SHA)).rejects.toThrow(
      "CANONICAL_MATCH_QUARANTINED",
    );
  });

  it("fails closed when the lookup cannot be made", async () => {
    await expect(isDemoContentQuarantined(fakeDb({ failOn: "matches" }).db, SHA)).rejects.toThrow(
      "UPLOAD_REGISTRATION_FAILED",
    );
    await expect(
      isDemoContentQuarantined(fakeDb({ matches: { id: "m1" }, failOn: "quarantine" }).db, SHA),
    ).rejects.toThrow("UPLOAD_REGISTRATION_FAILED");
  });

  it("is checked by createDemoUpload before the upload slot is reserved", () => {
    const source = readFileSync(resolve("src/lib/pipeline.functions.ts"), "utf8");
    const start = source.indexOf("export const createDemoUpload");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    const check = body.indexOf("assertDemoContentNotQuarantined(supabaseAdmin, data.demoSha256)");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(body.indexOf('rpc("reserve_demo_upload"'));
  });

  it("surfaces the refusal to the player and uploads nothing", async () => {
    const upload = vi.fn();
    const enqueue = vi.fn();
    const dependencies: SubmitDemoDependencies = {
      hash: async () => SHA,
      create: async () => {
        throw new Error("CANONICAL_MATCH_QUARANTINED");
      },
      upload,
      enqueue,
    };
    const file = new File([new Uint8Array(70 * 1024)], "m1-cache.dem");
    const error = await submitDemoWithDependencies(file, {}, dependencies).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DemoUploadError);
    expect((error as DemoUploadError).code).toBe("CANONICAL_MATCH_QUARANTINED");
    expect(upload).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("leaves other registration failures unchanged", async () => {
    const dependencies: SubmitDemoDependencies = {
      hash: async () => SHA,
      create: async () => {
        throw new Error("UPLOAD_REGISTRATION_FAILED");
      },
      upload: vi.fn(),
      enqueue: vi.fn(),
    };
    const file = new File([new Uint8Array(70 * 1024)], "m.dem");
    await expect(submitDemoWithDependencies(file, {}, dependencies)).rejects.toThrow(
      "UPLOAD_REGISTRATION_FAILED",
    );
  });
});

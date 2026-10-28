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
  CONTENT_RELEASED_QUARANTINED_MATCHES,
  isDemoContentQuarantined,
} from "@/lib/pipeline/quarantine.server";

/**
 * D17 (production job b7579762, 2026-10-21): the reference DEM 0caa7c97 maps to the
 * quarantined pre-provenance match a7b27f16 (content-addressed Canonical), so persistence
 * is refused with CANONICAL_MATCH_QUARANTINED. The job was retried three times (three full
 * 4.59M-row parses) because the failure was classified as transient.
 *
 * D32: a verified observation of that content now gets its own Canonical match (the
 * quarantined row is untouched), so only content still reserved by another quarantined
 * match is refused before upload.
 */

type Rows = Record<string, unknown>[];
function fakeDb(tables: { matches?: Rows; quarantine?: Rows; failOn?: "matches" | "quarantine" }) {
  const calls: string[] = [];
  const result = (key: "matches" | "quarantine", filter?: string[]) => {
    if (tables.failOn === key) return { data: null, error: { message: "boom" } };
    const rows = tables[key] ?? [];
    return {
      data: filter ? rows.filter((row) => filter.includes(String(row["match_id"]))) : rows,
      error: null,
    };
  };
  const db = {
    from(table: string) {
      calls.push(table);
      const key = table === "matches" ? "matches" : "quarantine";
      return {
        select: () => ({
          eq: async () => result(key),
          in: async (_column: string, values: string[]) => result(key, values),
        }),
      };
    },
  };
  return { db: db as never, calls };
}

const SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d";
const OTHER = "1111111111111111111111111111111111111111111111111111111111111111";
const RELEASED = "a7b27f16-4c85-428b-a855-0f683bda48a2";

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

  it("detects content still reserved by a quarantined Canonical match", async () => {
    expect(await isDemoContentQuarantined(fakeDb({}).db, OTHER)).toBe(false);
    expect(await isDemoContentQuarantined(fakeDb({ matches: [{ id: "m1" }] }).db, OTHER)).toBe(
      false,
    );
    const quarantined = fakeDb({ matches: [{ id: "m1" }], quarantine: [{ match_id: "m1" }] });
    expect(await isDemoContentQuarantined(quarantined.db, OTHER)).toBe(true);
    expect(quarantined.calls).toEqual(["matches", "canonical_match_quarantine"]);
    await expect(assertDemoContentNotQuarantined(quarantined.db, OTHER)).rejects.toThrow(
      "CANONICAL_MATCH_QUARANTINED",
    );
  });

  it("D32: content of the released pre-provenance match is accepted, with or without its new match", async () => {
    const released = fakeDb({ matches: [{ id: RELEASED }], quarantine: [{ match_id: RELEASED }] });
    expect(await isDemoContentQuarantined(released.db, SHA)).toBe(false);
    // The registry is not even consulted when no other match holds the content.
    expect(released.calls).toEqual(["matches"]);
    const withNewMatch = fakeDb({
      matches: [{ id: RELEASED }, { id: "new-verified-match" }],
      quarantine: [{ match_id: RELEASED }],
    });
    expect(await isDemoContentQuarantined(withNewMatch.db, SHA)).toBe(false);
    expect([...CONTENT_RELEASED_QUARANTINED_MATCHES]).toEqual([RELEASED]);
  });

  it("D32: the released id is exactly the one the migration excludes from content uniqueness", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20261028090000_d32_quarantined_content_reobservable.sql"),
      "utf8",
    );
    for (const id of CONTENT_RELEASED_QUARANTINED_MATCHES) {
      expect(migration).toContain(`AND id <> '${id}'::uuid`);
    }
    expect(migration).toContain("NOT public.is_canonical_match_quarantined(id)");
    expect(migration).toContain("NOT public.is_canonical_match_quarantined(match_id)");
    expect(migration).not.toMatch(
      /canonical_match_quarantine\s+(SET|WHERE)|DELETE FROM|UPDATE public\.matches/,
    );
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

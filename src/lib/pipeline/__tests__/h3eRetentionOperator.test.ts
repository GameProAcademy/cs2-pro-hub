import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleA91ReferenceFixture } from "@/routes/api/public/a91-reference-fixture";
import { handleH3ERetentionOperator } from "@/routes/api/public/h3e-retention-operator";

const SECRET = "synthetic-transport-secret-for-tests-only-0123456789";
const SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d";
const SIZE = 473748061;
const FIXTURE_PATH = `cf0549c2-dfbd-c4df-25b4-2ce8204edf87/${SHA}.dem`;
const ORPHAN = "7a680ca4-dbb5-4506-9aea-ebcbdf5bf6e1/probe-appflow.dem";

type World = {
  fixtureRow: Record<string, unknown> | null;
  objects: Map<string, number>; // `${bucket}:${path}` -> size
  references: number;
  removed: string[];
  signed: string[];
};
let world: World;

const cleanupDemoJobVerified = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pipeline/jobs.server", () => ({ cleanupDemoJobVerified }));

vi.mock("@/integrations/supabase/client.server", () => {
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      order: self,
      limit: self,
      maybeSingle: async () => {
        if (table === "r5_forensic_staging") return { data: world.fixtureRow, error: null };
        return {
          data: {
            status: "cancelled",
            cleanup_error: "DELETION_METADATA_MISMATCH",
            storage_path: "u/j.dem",
            storage_deleted_at: "2026-09-13T06:39:00Z",
            storage_delete_verified_at: null,
          },
          error: null,
        };
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({ count: table === "demo_jobs" ? world.references : 0, error: null }),
    });
    return chain;
  };
  const storage = {
    from: (bucket: string) => ({
      list: async (folder: string, { search }: { search: string }) => {
        const key = `${bucket}:${folder}/${search}`;
        return {
          data: world.objects.has(key)
            ? [{ name: search, metadata: { size: world.objects.get(key) } }]
            : [],
          error: null,
        };
      },
      remove: async (paths: string[]) => {
        for (const path of paths) {
          world.removed.push(`${bucket}:${path}`);
          world.objects.delete(`${bucket}:${path}`);
        }
        return { error: null };
      },
      createSignedUrl: async (path: string) => {
        world.signed.push(`${bucket}:${path}`);
        return {
          data: { signedUrl: "https://storage.example.invalid/signed?token=synthetic" },
          error: null,
        };
      },
    }),
  };
  return { supabaseAdmin: { from: query, storage } };
});

function fixtureRow(changes: Record<string, unknown> = {}) {
  return {
    bucket_id: "r5-forensic-staging",
    demo_sha256: SHA,
    observed_sha256: SHA,
    observed_size: SIZE,
    file_size: SIZE,
    bytes_readable: true,
    deleted_at: null,
    ...changes,
  };
}

function post(
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  auth = `Bearer ${SECRET}`,
) {
  return handler(
    new Request("http://localhost/api/public/x", {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("PARSER_ATTESTATION_TRANSPORT_SECRET", SECRET);
  world = {
    fixtureRow: fixtureRow(),
    objects: new Map([
      [`r5-forensic-staging:${FIXTURE_PATH}`, SIZE],
      [`demos:${ORPHAN}`, 1024],
      ["demos:u/j.dem", SIZE],
    ]),
    references: 0,
    removed: [],
    signed: [],
  };
  cleanupDemoJobVerified.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("H.3-E retention operator", () => {
  it("rejects unauthenticated callers and unknown actions before any Storage call", async () => {
    expect(
      (await post(handleH3ERetentionOperator, { action: "inspect" }, "Bearer wrong")).status,
    ).toBe(401);
    expect((await post(handleH3ERetentionOperator, { action: "delete_everything" })).status).toBe(
      400,
    );
    expect(
      (await post(handleH3ERetentionOperator, { action: "delete_orphan_object", path: "x" }))
        .status,
    ).toBe(200);
    // The path in the body is ignored: only the fixed orphan was touched.
    expect(world.removed).toEqual([`demos:${ORPHAN}`]);
  });

  it("refuses every deletion while the official fixture is not proven", async () => {
    for (const broken of [
      () => (world.fixtureRow = null),
      () => (world.fixtureRow = fixtureRow({ observed_sha256: "f".repeat(64) })),
      () => (world.fixtureRow = fixtureRow({ bytes_readable: false })),
      () => (world.fixtureRow = fixtureRow({ deleted_at: "2026-10-13T00:00:00Z" })),
      () => world.objects.delete(`r5-forensic-staging:${FIXTURE_PATH}`),
      () => world.objects.set(`r5-forensic-staging:${FIXTURE_PATH}`, SIZE - 1),
    ]) {
      broken();
      for (const action of ["delete_mismatched_job_object", "delete_orphan_object"]) {
        const body = await (await post(handleH3ERetentionOperator, { action })).json();
        expect(body.outcome).toBe("REFUSED_FIXTURE_NOT_PROVEN");
      }
      expect(cleanupDemoJobVerified).not.toHaveBeenCalled();
      expect(world.removed).toEqual([]);
      world.fixtureRow = fixtureRow();
      world.objects.set(`r5-forensic-staging:${FIXTURE_PATH}`, SIZE);
    }
  });

  it("deletes the mismatched job object only through the official G.6 path", async () => {
    cleanupDemoJobVerified.mockImplementation(async () => {
      world.objects.delete("demos:u/j.dem");
      return "verified";
    });
    const body = await (
      await post(handleH3ERetentionOperator, { action: "delete_mismatched_job_object" })
    ).json();
    expect(cleanupDemoJobVerified).toHaveBeenCalledWith("f736b6da-7677-4989-abec-05bc8d368002");
    expect(body.outcome).toBe("DELETE_VERIFIED");
    expect(body.fixture.preserved).toBe(true);
    expect(JSON.stringify(body)).not.toContain("u/j.dem");
  });

  it("reports a failed official deletion as a code, never as success", async () => {
    cleanupDemoJobVerified.mockRejectedValueOnce(new Error("DELETE_NOT_VERIFIED"));
    const body = await (
      await post(handleH3ERetentionOperator, { action: "delete_mismatched_job_object" })
    ).json();
    expect(body.outcome).toBe("FAILED:DELETE_NOT_VERIFIED");
  });

  it("deletes the orphan only when unreferenced and of the observed size, then re-reads absence", async () => {
    world.references = 1;
    expect(
      (await (await post(handleH3ERetentionOperator, { action: "delete_orphan_object" })).json())
        .outcome,
    ).toBe("REFUSED_ORPHAN_IS_REFERENCED");
    world.references = 0;
    world.objects.set(`demos:${ORPHAN}`, 2048);
    expect(
      (await (await post(handleH3ERetentionOperator, { action: "delete_orphan_object" })).json())
        .outcome,
    ).toBe("REFUSED_ORPHAN_IDENTITY_CHANGED");
    expect(world.removed).toEqual([]);
    world.objects.set(`demos:${ORPHAN}`, 1024);
    const body = await (
      await post(handleH3ERetentionOperator, { action: "delete_orphan_object" })
    ).json();
    expect(body.outcome).toBe("PHYSICAL_DELETION_CONFIRMED");
    expect(world.removed).toEqual([`demos:${ORPHAN}`]);
    const again = await (
      await post(handleH3ERetentionOperator, { action: "delete_orphan_object" })
    ).json();
    expect(again.outcome).toBe("ALREADY_ABSENT_CONFIRMED");
  });
});

describe("A9.1 reference fixture source", () => {
  it("issues a signed URL for exactly the official object, only after re-proving it", async () => {
    expect((await post(handleA91ReferenceFixture, {}, "Bearer wrong")).status).toBe(401);
    const ok = await post(handleA91ReferenceFixture, {});
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({
      source: "OFFICIAL_R5_FORENSIC_STAGING",
      sha256: SHA,
      sizeBytes: SIZE,
    });
    expect(world.signed).toEqual([`r5-forensic-staging:${FIXTURE_PATH}`]);
    world.fixtureRow = fixtureRow({ observed_size: SIZE + 1 });
    const refused = await post(handleA91ReferenceFixture, {});
    expect(refused.status).toBe(409);
    expect(world.signed).toHaveLength(1);
  });

  it("never logs the signed URL or the secret", () => {
    for (const file of [
      "src/routes/api/public/a91-reference-fixture.ts",
      "src/routes/api/public/h3e-retention-operator.ts",
    ]) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source).not.toMatch(/console\.\w+\([^)]*(url|transportSecret|signedUrl)/i);
    }
    const tree = readFileSync(resolve("src/routeTree.gen.ts"), "utf8");
    expect(tree).toContain("'/api/public/a91-reference-fixture'");
    expect(tree).toContain("'/api/public/h3e-retention-operator'");
  });
});

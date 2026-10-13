import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handlePredemManagedSnapshot } from "@/routes/api/public/predem-managed-snapshot";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

const SECRET = "synthetic-transport-secret-for-tests-only-0123456789";
const SNAPSHOT = {
  schema_version: 2,
  snapshot_at: "2026-10-13T09:00:00.000000Z",
  digest: "a".repeat(64),
};

function request(authorization?: string) {
  return new Request("http://localhost/api/public/predem-managed-snapshot", {
    method: "GET",
    ...(authorization ? { headers: { authorization } } : {}),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  rpc.mockReset();
});

describe("pre-DEM managed snapshot transport", () => {
  it("is not configured without a strong transport secret", async () => {
    vi.stubEnv("PARSER_ATTESTATION_TRANSPORT_SECRET", "short");
    const response = await handlePredemManagedSnapshot(request(`Bearer short`));
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects anonymous and wrong callers before touching the database", async () => {
    vi.stubEnv("PARSER_ATTESTATION_TRANSPORT_SECRET", SECRET);
    for (const header of [undefined, "Bearer wrong", SECRET]) {
      const response = await handlePredemManagedSnapshot(request(header));
      expect(response.status).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the database document unchanged, uncached", async () => {
    vi.stubEnv("PARSER_ATTESTATION_TRANSPORT_SECRET", SECRET);
    rpc.mockResolvedValueOnce({ data: SNAPSHOT, error: null });
    const response = await handlePredemManagedSnapshot(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ snapshot: SNAPSHOT });
    expect(rpc).toHaveBeenCalledWith("h3e_predem_managed_snapshot");
  });

  it("fails closed when the function is missing, errors or returns a non-object", async () => {
    vi.stubEnv("PARSER_ATTESTATION_TRANSPORT_SECRET", SECRET);
    for (const result of [
      { data: null, error: { message: "function does not exist" } },
      { data: [SNAPSHOT], error: null },
      { data: "x", error: null },
    ]) {
      rpc.mockResolvedValueOnce(result);
      expect((await handlePredemManagedSnapshot(request(`Bearer ${SECRET}`))).status).toBe(503);
    }
    rpc.mockRejectedValueOnce(new Error("synthetic outage"));
    expect((await handlePredemManagedSnapshot(request(`Bearer ${SECRET}`))).status).toBe(503);
  });

  it("is registered and never logs the document or the secret", () => {
    const source = readFileSync(
      resolve("src/routes/api/public/predem-managed-snapshot.ts"),
      "utf8",
    );
    const routeTree = readFileSync(resolve("src/routeTree.gen.ts"), "utf8");
    expect(source).toContain('createFileRoute("/api/public/predem-managed-snapshot")');
    expect(routeTree).toContain("'/api/public/predem-managed-snapshot'");
    expect(source).toContain('console.info("[predem-managed-snapshot] served", { digest })');
    expect(source).not.toMatch(/console\.\w+\([^)]*(transportSecret|data\b)/);
  });
});

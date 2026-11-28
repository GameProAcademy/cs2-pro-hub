/** VGL 5.0 — Frente 8: FACEIT native matches never overwrite demo data; read surface is scoped. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { faceitWritableMatchIds } from "@/lib/faceit/faceitOwnership";

const read = (p: string) => readFileSync(p, "utf8");

describe("faceitWritableMatchIds", () => {
  it("only FACEIT-owned rows are writable; a demo match attached by the resolver is a link", () => {
    expect(
      faceitWritableMatchIds([
        { id: "f1", data_source: "faceit" },
        { id: "d1", data_source: "demo" },
        { id: "x", data_source: null },
      ]),
    ).toEqual({ writable: ["f1"], linkedToDemo: ["d1", "x"] });
    expect(faceitWritableMatchIds([])).toEqual({ writable: [], linkedToDemo: [] });
  });
});

describe("sync worker (source guards)", () => {
  const sync = read("src/lib/faceit/faceit.sync.server.ts");
  const block = sync.slice(
    sync.indexOf("counters.matchesInserted += persisted.created;"),
    sync.indexOf(
      "} catch (error) {",
      sync.indexOf("counters.matchesInserted += persisted.created;"),
    ),
  );

  it("source bookkeeping and metrics only land on writable FACEIT rows", () => {
    expect(block).toContain("faceitWritableMatchIds(owners ?? [])");
    expect(block).toContain('.in("id", writable)');
    expect(block).toContain('.eq("data_source", "faceit")');
    expect(block).toContain("writable.map((matchId) =>");
    expect(block).not.toMatch(/persisted\.matchIds\.map\(/);
    expect(block).not.toContain('.in("id", persisted.matchIds);\n      // Match stats');
  });

  it("links are counted and reported, never silent", () => {
    expect(sync).toContain("counters.matchesLinkedToDemo += linkedToDemo.length;");
    expect(sync).toContain("linked_to_demo: counters.matchesLinkedToDemo,");
  });

  it("the parser is not touched by this path", () => {
    expect(sync).not.toMatch(/demoparser|parseDemo|worker\/parse/i);
  });
});

describe("read surface", () => {
  const fn = read("src/lib/faceitMatches.functions.ts");
  it("is authenticated, owner-scoped and FACEIT-only", () => {
    expect(fn).toContain(".middleware([requireSupabaseAuth])");
    expect(fn).toContain('.eq("user_id", context.userId)');
    expect(fn).toContain('.eq("data_source", "faceit")');
    expect(fn).not.toMatch(/client\.server|supabaseAdmin/);
  });

  it("demo-based aggregates stay demo-only (overview is built from demo jobs)", () => {
    const overview = read("src/lib/playerData.functions.ts");
    const loader = overview.slice(overview.indexOf("export async function loadPlayerOverview"));
    expect(loader).toContain('.from("demo_jobs")');
    expect(loader).not.toContain('"faceit"');
  });

  it("the profile shows the FACEIT list next to the connection panel", () => {
    expect(read("src/routes/_authenticated/profile.tsx")).toContain("<FaceitMatchesCard />");
    const card = read("src/components/integrations/FaceitMatchesCard.tsx");
    expect(card).toContain('data-source="faceit"');
    expect(card).toContain("enabled: connected");
  });
});

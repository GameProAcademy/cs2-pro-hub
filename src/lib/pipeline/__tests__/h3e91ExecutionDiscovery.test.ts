import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// This guard is source-only. It cannot establish deployed Railway parity or
// prove that a browser bundle has no other dynamic import path.
const productionRoots = ["src/lib", "src/routes", "services/cs2-demo-parser"];
function productionFiles(root: string): string[] {
  return readdirSync(resolve(process.cwd(), root), { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : productionFiles(path);
    return /\.(ts|tsx|py)$/.test(entry.name) ? [path] : [];
  });
}

const executablePatterns = [
  /\b(?:adapter|service)\.parseDemo\s*\(/g,
  /\basyncio\.to_thread\(parse\s*,/g,
  /\bparse_demo_file\s*\(/g,
  /\bparser\.(?:parseTicks|parseEvent|parseHeader|parseEvents)\s*\(/g,
  /\bnew Worker\(new URL\("\.\/clientParser\.worker\.ts"/g,
];

// All matching sites must be classified. References/definitions are intentionally
// excluded; unknown actual calls fail rather than silently passing as documentation.
const classified: Record<string, { count: number; classification: string }> = {
  "src/lib/pipeline/jobs.server.ts": { count: 1, classification: "PRODUCTION_EXECUTION_SURFACE:APP_REMOTE_PARSER" },
  "src/lib/client-parser/clientParser.service.ts": { count: 1, classification: "PRODUCTION_EXECUTION_SURFACE:BROWSER_WASM_POC" },
  "src/lib/client-parser/clientParser.worker.ts": { count: 3, classification: "PRODUCTION_EXECUTION_SURFACE:BROWSER_WASM_POC" },
  "services/cs2-demo-parser/app.py": { count: 1, classification: "PRODUCTION_EXECUTION_SURFACE:RAILWAY_DURABLE_WORKER+RAILWAY_V1_PARSE" },
};

describe("H.3-E.9.1 execution source discovery", () => {
  it("fails if an unclassified parser invocation is added in production source", () => {
    const found = Object.fromEntries(
      productionRoots.flatMap(productionFiles).flatMap((path) => {
        const source = read(path);
        const count = executablePatterns.reduce((sum, pattern) => sum + [...source.matchAll(pattern)].length, 0);
        return count > 0 ? [[path, count]] : [];
      }),
    );
    expect(found).toEqual(Object.fromEntries(Object.entries(classified).map(([file, value]) => [file, value.count])));
    expect(Object.values(classified).every(({ classification }) => classification.startsWith("PRODUCTION_EXECUTION_SURFACE:"))).toBe(true);
  });

  it("still discovers both independent Railway entrypoints and their shared boundary", () => {
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def parse_endpoint\(/);
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def _parse_request\(/);
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def _parse_downloaded\(/);
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def _parse_durable_request\(/);
    expect(read("services/cs2-demo-parser/worker.py")).toMatch(/async def durable_consumer_loop\(/);
  });

  it("does not confuse an additive identity schema with a functioning writer", () => {
    const sql = read("supabase/migrations/20260926020606_0ba1725a-4f21-4c1e-8d4a-68d3b81b0037.sql");
    expect(sql).toContain("ADD COLUMN execution_id uuid");
    expect(sql).toContain("ADD COLUMN event_id uuid");
    expect(sql).toContain("CREATE UNIQUE INDEX h3e91_execution_event_id_unique");
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES/);
    expect(sql).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION\s+public\.h3e91_record_execution_event/i);
  });
});
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
    if (entry.isDirectory())
      return entry.name === "tests" || entry.name === "__tests__" ? [] : productionFiles(path);
    return /\.(ts|tsx|py)$/.test(entry.name) ? [path] : [];
  });
}

const executablePatterns = [
  /\b(?:adapter|service)\.parseDemo\s*\(/g,
  /\basyncio\.to_thread\(parse\s*,/g,
  /\bparse_demo_file\s*\(/g,
  /\bparser\.(?:parseTicks|parseEvent|parseHeader|parseEvents|parseGrenades|parsePlayerInfo)\s*\(/g,
  /\bnew Worker\(new URL\("\.\/clientParser\.worker\.ts"/g,
];

// All matching sites must be classified. References/definitions are intentionally
// excluded; unknown actual calls fail rather than silently passing as documentation.
const classified: Record<string, { count: number; classification: string }> = {
  "src/lib/pipeline/jobs.server.ts": {
    count: 1,
    classification: "PRODUCTION_EXECUTION_SURFACE:APP_REMOTE_PARSER",
  },
  "src/lib/client-parser/clientParser.service.ts": {
    count: 1,
    classification: "PRODUCTION_EXECUTION_SURFACE:BROWSER_WASM_POC",
  },
  "src/lib/client-parser/clientParser.worker.ts": {
    count: 5,
    classification: "PRODUCTION_EXECUTION_SURFACE:BROWSER_WASM_POC",
  },
  "services/cs2-demo-parser/app.py": {
    count: 1,
    classification: "PRODUCTION_EXECUTION_SURFACE:RAILWAY_DURABLE_WORKER+RAILWAY_V1_PARSE",
  },
  "services/cs2-demo-parser/parser.py": {
    count: 1,
    classification: "PRODUCTION_EXECUTION_SURFACE:SHARED_PARSER_IMPLEMENTATION",
  },
  "services/cs2-demo-parser/python_reference.py": {
    count: 1,
    classification: "TEST_ONLY:REFERENCE_CLI_IMAGE_EXCLUDED",
  },
};

describe("H.3-E.9.1 execution source discovery", () => {
  it("fails if an unclassified parser invocation is added in production source", () => {
    const found = Object.fromEntries(
      productionRoots.flatMap(productionFiles).flatMap((path) => {
        const source = read(path);
        const count = executablePatterns.reduce(
          (sum, pattern) => sum + [...source.matchAll(pattern)].length,
          0,
        );
        return count > 0 ? [[path, count]] : [];
      }),
    );
    expect(found).toEqual(
      Object.fromEntries(Object.entries(classified).map(([file, value]) => [file, value.count])),
    );
    expect(
      Object.values(classified).every(
        ({ classification }) =>
          classification.startsWith("PRODUCTION_EXECUTION_SURFACE:") ||
          classification.startsWith("TEST_ONLY:"),
      ),
    ).toBe(true);
  });

  it("still discovers both independent Railway entrypoints and their shared boundary", () => {
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def parse_endpoint\(/);
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def _parse_request\(/);
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def _parse_downloaded\(/);
    expect(read("services/cs2-demo-parser/app.py")).toMatch(/async def _parse_durable_request\(/);
    expect(read("services/cs2-demo-parser/worker.py")).toMatch(/async def durable_consumer_loop\(/);
  });

  it("requires a runtime image allowlist that excludes the reference producer", () => {
    const dockerfile = read("services/cs2-demo-parser/Dockerfile");
    expect(dockerfile).not.toMatch(/^COPY \. \.$/m);
    const runtime = dockerfile.match(/^COPY (.+app\.py.+) \.\/$/m)?.[1]?.split(/\s+/) ?? [];
    expect(runtime).toContain("app.py");
    expect(runtime).toContain("parser.py");
    expect(runtime).toContain("worker.py");
    expect(runtime).not.toContain("python_reference.py");
    expect(runtime).not.toContain("raw_manifest_audit.py");
    expect(classified["services/cs2-demo-parser/python_reference.py"]?.classification).toContain(
      "TEST_ONLY:",
    );
  });

  it("does not silently admit unclassified parser entrypoints, imports or browser workers", () => {
    const production = productionRoots.flatMap(productionFiles);
    const sites = production.flatMap((path) => {
      const source = read(path);
      const matches = [
        ...source.matchAll(
          /\b(?:from parser import parse_demo_file|from ["']\.\/clientParser\.service["']|from ["']@\/lib\/client-parser\/clientParser\.service["'])/g,
        ),
        ...source.matchAll(
          /\b(?:@app\.post\(["']\/v1\/parse["']|async def durable_consumer_loop\()/g,
        ),
      ];
      return matches.length ? [[path, matches.length]] : [];
    });
    expect(Object.fromEntries(sites)).toEqual({
      "services/cs2-demo-parser/app.py": 1,
      "services/cs2-demo-parser/python_reference.py": 1,
      "services/cs2-demo-parser/worker.py": 1,
    });
    expect(read("src/components/pipeline/ClientParserPoc.tsx")).toContain("ClientParserService");
    const pocRoute = read("src/routes/_authenticated/client-parser-poc.tsx");
    expect(pocRoute).not.toMatch(/import\s*(?:\(|[^;]*from).*ClientParserPoc/);
    expect(pocRoute).not.toContain("ClientParserService");
    expect(pocRoute).toContain("STATUS: FEATURE_DISABLED");
    expect(read("src/config/app.ts")).toMatch(/clientDemParserPoc:\s*false/);
    expect(read("src/lib/client-parser/clientParser.service.ts")).toMatch(
      /import\.meta\.env\.PROD\) throw new ClientParserError\("CLIENT_PARSER_UNAVAILABLE"\)/,
    );
    const reachable = productionRoots
      .slice(0, 2)
      .flatMap(productionFiles)
      .filter((path) => !path.startsWith("src/lib/client-parser/"))
      .filter((path) => !path.includes(".server."))
      .filter((path) => /(?:import\s*\(|from\s*["'])[^\n]*clientParser\.(?:service|worker)|(?:import\s*\(|from\s*["'])[^\n]*ClientParserPoc/.test(read(path)));
    expect(reachable).toEqual([]);
  });

  it("does not confuse an additive identity schema with a functioning writer", () => {
    const sql = read("supabase/migrations/20260926020606_0ba1725a-4f21-4c1e-8d4a-68d3b81b0037.sql");
    expect(sql).toContain("ADD COLUMN execution_id uuid");
    expect(sql).toContain("ADD COLUMN event_id uuid");
    expect(sql).toContain("CREATE UNIQUE INDEX h3e91_execution_event_id_unique");
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES/);
    expect(sql).not.toMatch(
      /CREATE\s+(OR REPLACE\s+)?FUNCTION\s+public\.h3e91_record_execution_event/i,
    );
  });

  it("rejects direct application writes to the sealed ledger", () => {
    const sourceFiles = ["src", "services/cs2-demo-parser", "scripts"].flatMap(productionFiles);
    const directWrites = sourceFiles.filter((path) => {
      const source = read(path);
      return /\b(?:from\s*\(\s*["']h3e91_execution_evidence_ledger["']\s*\)|h3e91_execution_evidence_ledger)(?:[\s\S]{0,150})\.(?:insert|upsert|update|delete)\s*\(/.test(
        source,
      );
    });
    expect(directWrites).toEqual([]);
  });
});

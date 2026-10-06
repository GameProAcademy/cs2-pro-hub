import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("H.3-E.5 runtime fingerprint route registration", () => {
  it("keeps the source server route and generated route tree aligned", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/api/public/parser-attestation-runtime.ts"),
      "utf8",
    );
    const routeTree = readFileSync(
      resolve(process.cwd(), "src/routeTree.gen.ts"),
      "utf8",
    );

    expect(source).toContain(
      'createFileRoute("/api/public/parser-attestation-runtime")',
    );
    expect(routeTree).toContain(
      "ApiPublicParserAttestationRuntimeRouteImport",
    );
    expect(routeTree).toContain(
      "'/api/public/parser-attestation-runtime'",
    );
  });
});

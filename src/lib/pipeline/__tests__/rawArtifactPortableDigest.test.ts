import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { rawArtifactSha256, stableRawArtifactJson } from "@/lib/pipeline/rawArtifactContract";

// The worker asserts the same digest for the same file
// (services/cs2-demo-parser/tests/test_portable_digest.py).
const EXPECTED = "e1e49c02fecb4b31fd0ff0803c4ab04f64094498c752e163aaf98de7d2bda941";

describe("RAW digests recomputed by the APP", () => {
  it("matches the worker on the shared vector after a JSON round trip", () => {
    const value = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "services/cs2-demo-parser/tests/fixtures/portable_digest_vector.json",
        ),
        "utf8",
      ),
    );
    expect(rawArtifactSha256(stableRawArtifactJson(value))).toBe(EXPECTED);
  });

  it("orders keys by code unit, not by locale collation", () => {
    // localeCompare put "name" before "PlayerID"; the worker has "PlayerID" first.
    expect(stableRawArtifactJson({ name: 1, PlayerID: 2, _x: 3 })).toBe(
      '{"PlayerID":2,"_x":3,"name":1}',
    );
  });
});

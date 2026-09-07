import { ME, syntheticParserOutput } from "@/lib/pipeline/__tests__/fixture";
import { normalizeParserOutput } from "@/lib/pipeline/normalizer";
import { demoToCanonicalBundle } from "@/lib/canonical/adapters/demo.adapter";
import { canonicalBundleToRpcPayload } from "@/lib/canonical/canonical.persistence.server";

const bundle = demoToCanonicalBundle({
  parsed: normalizeParserOutput(syntheticParserOutput),
  fingerprint: "e".repeat(64),
  targetSteamId: ME,
  internalPlayerId: null,
  fetchedAt: "2026-01-02T03:04:05.000Z",
});
const b = bundle as any;
b.observation.externalMatchId = "test-demo-001";
console.log(JSON.stringify(canonicalBundleToRpcPayload(bundle)));

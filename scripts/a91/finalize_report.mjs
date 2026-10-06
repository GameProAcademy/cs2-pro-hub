import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIXTURE, decide, sanitizeReport } from "./contracts.mjs";

const directory = resolve(process.argv[2]);
const read = (name) => JSON.parse(readFileSync(resolve(directory,name),"utf8"));
const surface = readFileSync("docs/client-parser/upstream-surface-manifest.json","utf8");
const manifest = JSON.parse(readFileSync("public/client-parser/demoparser2/0.42.0/artifact-manifest.json","utf8"));
const runs = ["python_run_1.json","python_run_2.json","wasm_run_1.json","wasm_run_2.json"].map(read);
const parity = read("parity_report.json");
const determinism = read("determinism_report.json");
const catalog = JSON.parse(surface);
const decision = decide(runs,parity,determinism,catalog,manifest);
const report = { ...decision,fixture:FIXTURE,
  authorization:{ authorized:true,authorizationRef:FIXTURE.authorizationRef,provenance:"LOCAL_FILE" },
  parser:{version:"0.42.0",revision:catalog.provenance.commit},
  catalog:{version:catalog.catalogVersion,digest:catalog.catalogDigest},
  contract:{version:catalog.contractVersion,digest:catalog.contractDigest},
  wasmArtifact:{bindingSha256:manifest.binding.sha256,wasmSha256:manifest.wasm.sha256,artifactIdentity:runs[2].artifactIdentity},
  runs:{python:runs.filter((r) => r.runtime === "PYTHON").map((r) => ({runId:r.runId,status:r.status,normalizedDigest:r.normalizedResultDigest,durationMs:r.durationMs})),
    wasm:runs.filter((r) => r.runtime === "WASM").map((r) => ({runId:r.runId,status:r.status,normalizedDigest:r.normalizedResultDigest,artifactIdentity:r.artifactIdentity,durationMs:r.durationMs}))},
  parity:{status:parity.status,digest:parity.parity_digest,dimensions:parity.comparisons,mismatches:parity.comparisons.filter((c) => c.equal !== true)},
  determinism:{status:determinism.status,digest:determinism.determinism_digest,
    pythonDeterministic:determinism.comparisons.filter((c) => c.runtime === "PYTHON").every((c) => c.equal),
    wasmDeterministic:determinism.comparisons.filter((c) => c.runtime === "WASM").every((c) => c.equal)} };
writeFileSync(resolve(directory,"a91_real_dem_report.json"),sanitizeReport(report));
process.exitCode = decision.status === "PASS" ? 0 : 1;
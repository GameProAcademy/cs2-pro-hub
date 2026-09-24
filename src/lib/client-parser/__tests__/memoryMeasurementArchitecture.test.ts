import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const contract = read("../memoryMeasurement.ts");
const worker = read("../memoryMeasurement.worker.ts");
const runner = read("../memoryMeasurement.runner.ts");
const report = read("../memoryMeasurementReport.ts");
const ui = read("../../../components/pipeline/BrowserMemoryLab.tsx");
const parserPoc = read("../../../components/pipeline/ClientParserPoc.tsx");
const adminRoute = read("../../../routes/_authenticated/admin/memory-lab.tsx");
const adminShell = read("../../../components/admin/AdminShell.tsx");
const config = read("../../../config/app.ts");
const executionSurface = `${contract}\n${worker}\n${runner}\n${report}`;
const all = `${executionSurface}\n${ui}`;

describe("memory lab architecture guards", () => {
  it("keeps synthetic contiguous materialization inside the dedicated Worker adapter", () => {
    expect(worker).toContain("arrayBuffer()");
    expect(worker).toContain("MATERIALIZATION_READ_FAILED");
    expect(worker).toContain("MATERIALIZATION_LENGTH_MISMATCH");
    expect(runner).not.toContain(".arrayBuffer(");
    expect(ui).not.toContain(".arrayBuffer(");
    expect(worker).not.toMatch(/demoparser2|parseDemo|ClientParserService|readContiguousDemoInput/);
    expect(runner).not.toContain("void sample().then");
    expect(runner).not.toContain("observedMaterializationBytes");
    expect(runner).not.toMatch(/performance\.memory/);
  });

  it("validates the worker command structurally across the worker boundary", () => {
    expect(worker).toContain('typeof fixture?.arrayBuffer === "function"');
    expect(worker).not.toContain("fixture instanceof File");
  });

  it("never returns binary values from the Worker", () => {
    expect(worker).not.toMatch(/postMessage\([\s\S]*?(ArrayBuffer|Uint8Array|buffer\s*:)/);
    expect(worker).not.toMatch(/console\.(log|warn|error)/);
  });

  it("does not persist, upload, analyze, or contact protected infrastructure", () => {
    expect(executionSurface).not.toMatch(
      /localStorage|indexedDB|supabase|storage\.|analytics|fetch\(|Railway|attestation|Canonical|R5\.8/i,
    );
  });

  it("exposes the lab through its own admin route without the parser POC flag", () => {
    expect(adminRoute).toContain("<BrowserMemoryLab />");
    expect(adminRoute).toContain("FEATURES.clientDemMemoryLab");
    expect(adminRoute).not.toContain("clientDemParserPoc");
    expect(parserPoc).not.toContain("BrowserMemoryLab");
    expect(adminShell).toContain('to: "/admin/memory-lab"');
    expect(adminShell).toContain("FEATURES.clientDemMemoryLab");
  });

  it("keeps the disabled route fail-closed and the protocol manual", () => {
    expect(adminRoute).toContain("STATUS: FEATURE_DISABLED");
    expect(ui).not.toMatch(/useEffect|setInterval|setTimeout/);
    expect(ui).toContain("16 / 32 / 64 / 96 / 128 MiB × 3");
    expect(ui).toContain("Reset H.1-M session");
  });

  it("keeps production parser closed and the ceiling sourced from the existing constant", () => {
    expect(contract).toContain("MAX_SYNTHETIC_FIXTURE_BYTES = CLIENT_DEMO_MAX_BYTES");
    expect(config).toContain("realDemoParser: false");
    expect(config).toContain('VITE_CLIENT_DEM_MEMORY_LAB"] === "true"');
  });

  it("uses neutral cleanup evidence without diagnosing memory state", () => {
    expect(contract).toContain('"CLEANUP_OBSERVED"');
    expect(contract).not.toMatch(/CLEANUP_OBSERVED_(RESIDUAL|STABLE)/);
    expect(all).not.toMatch(/memory leak confirmed|exact peak/i);
  });

  it("contains no embedded DEM or base64 fixture", () => {
    expect(all).not.toMatch(/\.dem["'`]|data:application|base64,/i);
  });
});

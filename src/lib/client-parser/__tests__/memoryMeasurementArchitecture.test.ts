import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const contract = read("../memoryMeasurement.ts");
const worker = read("../memoryMeasurement.worker.ts");
const runner = read("../memoryMeasurement.runner.ts");
const report = read("../memoryMeasurementReport.ts");
const ui = read("../../../components/pipeline/BrowserMemoryLab.tsx");
const config = read("../../../config/app.ts");
const all = `${contract}\n${worker}\n${runner}\n${report}\n${ui}`;

describe("memory lab architecture guards", () => {
  it("keeps full materialization inside the dedicated Worker adapter", () => {
    expect(worker).toContain("readContiguousDemoInput");
    expect(runner).not.toContain(".arrayBuffer(");
    expect(ui).not.toContain(".arrayBuffer(");
    expect(worker).not.toMatch(/demoparser2|parseDemo|ClientParserService/);
  });

  it("never returns binary values from the Worker", () => {
    expect(worker).not.toMatch(/postMessage\([\s\S]*?(ArrayBuffer|Uint8Array|buffer\s*:)/);
    expect(worker).not.toMatch(/console\.(log|warn|error)/);
  });

  it("does not persist, upload, analyze, or contact protected infrastructure", () => {
    expect(all).not.toMatch(/localStorage|indexedDB|supabase|storage\.|analytics|fetch\(|Railway|attestation|Canonical|R5\.8/i);
  });

  it("keeps production parser closed and the ceiling sourced from the existing constant", () => {
    expect(contract).toContain("MAX_SYNTHETIC_FIXTURE_BYTES = CLIENT_DEMO_MAX_BYTES");
    expect(config).toContain("realDemoParser: false");
    expect(config).toContain('VITE_CLIENT_DEM_MEMORY_LAB"] === "true"');
  });

  it("contains no embedded DEM or base64 fixture", () => {
    expect(all).not.toMatch(/\.dem["'`]|data:application|base64,/i);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isClientParserWorkerEvent } from "../clientParser.protocol";
import { isLargeDemHashWorkerEvent } from "../largeDemHash";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("large DEM architecture guards", () => {
  it("keeps whole-file materialization out of React and the main-thread service", () => {
    const component = read("../../../components/pipeline/ClientParserPoc.tsx");
    const service = read("../clientParser.service.ts");
    expect(component).not.toContain(".arrayBuffer()");
    expect(service).not.toContain(".arrayBuffer()");
    expect(service).toContain("hashLargeDemInWorker");
    expect(service).toContain("file,");
  });

  it("keeps the sole whole-file conversion in the parser input adapter", () => {
    const adapter = read("../clientParser.input.ts");
    const parserWorker = read("../clientParser.worker.ts");
    expect(adapter.match(/file\.arrayBuffer\(\)/g)).toHaveLength(1);
    expect(parserWorker).not.toContain("file.arrayBuffer()");
    expect(parserWorker).toContain("readContiguousDemoInput");
  });

  it("hashes slices in a Worker without returning raw bytes", () => {
    const hashWorker = read("../largeDemHash.worker.ts");
    expect(hashWorker).toContain("request.file.slice(offset, end).arrayBuffer()");
    expect(hashWorker).not.toContain("request.file.arrayBuffer()");
    expect(hashWorker).not.toMatch(/postMessage\([^)]*bytes\s*:/s);
    expect(hashWorker).not.toMatch(/console\.(log|error|warn)/);
  });

  it("rejects malformed parser and hash worker messages", () => {
    expect(isClientParserWorkerEvent({ type: "PROGRESS", requestId: "x" })).toBe(false);
    expect(isClientParserWorkerEvent({ type: "UNKNOWN", requestId: "x" })).toBe(false);
    expect(isLargeDemHashWorkerEvent({ type: "COMPLETE", requestId: "x", sha256: "bad" })).toBe(
      false,
    );
    expect(isLargeDemHashWorkerEvent({ type: "RAW", requestId: "x", bytes: [1] })).toBe(false);
  });
});
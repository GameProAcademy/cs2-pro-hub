import { describe, expect, it } from "vitest";
import { buildXRay } from "@/lib/diagnostics/xray";
import { PRIORITY_VERSION_V2, type PriorityResultV2 } from "@/lib/training/priorityV2";

const dna = (dims: Array<{ dimension: string; value: number | null; status?: string }>) =>
  ({
    state: "READY",
    matches: 3,
    minimumMatches: 3,
    dimensions: dims.map((d) => ({ ...d, signals: [{ matches: 3 }] })),
  }) as never;
const overview = { matches: [] } as never;

describe("UX-1.7c Raio-X follows the single Training list and the DNA v3 states", () => {
  const d = dna([
    { dimension: "dueling", value: 0.35 },
    { dimension: "clutch", value: null, status: "NO_SAMPLE" },
    { dimension: "economy", value: null, status: "NOT_MEASURED" },
  ]);
  it("no Training priority → no recommendation, even with DNA indices below 60", () => {
    const training: PriorityResultV2 = {
      version: PRIORITY_VERSION_V2,
      matches: 3,
      priorities: [],
      observing: [],
    };
    const x = buildXRay({ overview, dna: d, sides: [], training });
    expect(x.inferences.length).toBeGreaterThan(0);
    expect(x.recommendations).toEqual([]);
    expect(x.trainingVersion).toBe(PRIORITY_VERSION_V2);
  });
  it("Training priorities become the recommendations (one per dimension)", () => {
    const sig = { dimension: "dueling", status: "RECOMMEND" } as never;
    const training = {
      version: PRIORITY_VERSION_V2,
      matches: 3,
      priorities: [sig, sig],
      observing: [],
    } as PriorityResultV2;
    const x = buildXRay({ overview, dna: d, sides: [], training });
    expect(x.recommendations.map((r) => [r.dimension, r.source])).toEqual([
      ["dueling", "training-v2"],
    ]);
  });
  it("v3 statuses reach the readings instead of a generic 'not observed'", () => {
    const x = buildXRay({ overview, dna: d, sides: [] });
    const all = x.dimensions.flatMap((dim) => dim.dna);
    expect(all.find((r) => r.dimension === "clutch")?.indexStatus).toBe("NO_SAMPLE");
    expect(all.find((r) => r.dimension === "economy")?.indexStatus).toBe("NOT_MEASURED");
  });
});

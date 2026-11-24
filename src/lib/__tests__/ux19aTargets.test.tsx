import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("UX-1.9a touch targets found in the production review", () => {
  it("the replay timeline has a 24 px touch height", () => {
    const src = readFileSync("src/components/real/RealReplay.tsx", "utf8");
    expect(src).toMatch(/type="range"[\s\S]{0,900}className="h-6 w-full/);
  });
  it("every heatmap cell is reachable from the list (show all)", () => {
    const src = readFileSync("src/components/real/RealHeatmap.tsx", "utf8");
    expect(src).toContain(".slice(0, showAll ? undefined : 10)");
    expect(src).toContain("[h.cells, showAll]");
    expect(src).toContain("aria-expanded={showAll}");
  });
});

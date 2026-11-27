import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("VGL 4 closure", () => {
  // vgl-art animates opacity and transform with fill-mode both, so it overrides
  // any opacity/translate utility on the same element (seen in production on
  // the DNA identity card, where the faint art rendered at full strength).
  it("never puts vgl-art on an element that also sets opacity or translate", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/className="([^"]*\bvgl-art\b[^"]*)"/g)) {
        if (/\b(opacity-|-?translate-)/.test(m[1]!)) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("VGL 4 closure — mobile grids", () => {
  // An implicit grid column is `auto`, so a long line (a priority title, a
  // segmented bar) widens the card past a 390 px screen. Seen in production
  // on the Training overview.
  it("gives the training overview an explicit single column below lg", () => {
    const src = readFileSync("src/components/cs2/TrainingKit.tsx", "utf8");
    expect(src).toContain('"mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3"');
  });
});

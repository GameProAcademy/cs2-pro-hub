/**
 * VGL 3.0 — fixes seen in production. The room header shows the score block only with a resolved
 * score (the line above already says "not determined"); the event tick is hidden on phones only;
 * the radar method text moved into "how to read" (same key, same value).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(resolve(p), "utf8");

describe("VGL 3.0 production fixes", () => {
  it("room header: no duplicate 'not determined' score block", () => {
    const r = src("src/components/real/RealMatchRoom.tsx");
    expect(r).toMatch(
      /m\.resultStatus !== "UNRESOLVED_BY_DEMO" &&\s+m\.scorePlayer !== null &&\s+m\.scoreOpponent !== null \? \(\s+<ScoreLine/,
    );
  });
  it("kill feed: tick hidden on phones only", () => {
    expect(src("src/components/real/RealRounds.tsx")).toContain(
      '<span className="font-mono text-muted-foreground max-sm:hidden">{e.tick}</span>',
    );
  });
  it("DNA radar method kept, inside the basis details", () => {
    const d = src("src/components/real/RealDna.tsx");
    const details = d.slice(d.indexOf("data-dna-basis"), d.indexOf("</details>"));
    expect(details).toContain('t("real.dna.radarSub")');
    expect(d).not.toMatch(/subtitle=\{fill\(t\("real\.dna\.radarSub"\)/);
  });
});

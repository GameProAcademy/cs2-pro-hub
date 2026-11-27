/**
 * Visual Game Language — moments, evolution, maps, performance and Player DNA. Pictograms are
 * decorative next to real values; the score bar only redraws the points column.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContributionBar } from "@/components/real/RealProScore";
import { I18nProvider } from "@/i18n";
import { DNA_DIMENSIONS } from "@/lib/dna/snapshotCompare";
import { MOMENT_KINDS } from "@/lib/moments/moments";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const render = (node: React.ReactNode) =>
  renderToString(<I18nProvider initialLocale="pt-BR">{node}</I18nProvider>);

describe("performance contribution bar", () => {
  it("draws only available, positive contributions with widths from the same points", () => {
    const html = render(
      <ContributionBar
        components={[
          { id: "a", available: true, contribution: 30 },
          { id: "b", available: true, contribution: 10 },
          { id: "c", available: false, contribution: 0 },
        ]}
      />,
    );
    expect(html).toContain('data-segment="a"');
    expect(html).toContain("width:75%");
    expect(html).toContain("width:25%");
    expect(html).not.toContain('data-segment="c"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders nothing without a real contribution (no redistributed weight)", () => {
    expect(
      render(<ContributionBar components={[{ id: "a", available: false, contribution: 0 }]} />),
    ).toBe("");
  });

  it("is shown only for a READY score", () => {
    expect(src("src/components/real/RealProScore.tsx")).toContain(
      '{score.state === "READY" ? <ContributionBar components={score.components} /> : null}',
    );
  });
});

describe("pictograms cover every real category", () => {
  it("every moment kind has an icon; the map tile appears only with a known map", () => {
    const moments = src("src/components/moments/RealMoments.tsx");
    for (const k of MOMENT_KINDS) expect(moments).toMatch(new RegExp(`\\b${k}: "`));
    expect(moments).toContain(
      '{m.map ? <MapTile map={m.map} size="sm" className="self-center" /> : null}',
    );
  });

  it("every DNA dimension has an icon", () => {
    const dna = src("src/components/real/RealDna.tsx");
    for (const d of DNA_DIMENSIONS) expect(dna).toMatch(new RegExp(`\\b${d}: "`));
  });

  it("evolution and maps use the map tile for real maps only", () => {
    expect(src("src/components/real/RealEvolution.tsx").replace(/\s+/g, " ")).toContain(
      '{p.map ? ( <MapTile map={p.map} size="sm" showName /> ) : ( <span>{NOT_AVAILABLE_MARK}</span> )}',
    );
    expect(src("src/components/real/RealHeatmap.tsx")).toContain(
      'actions={<MapTile map={h.map} size="sm" showName />}',
    );
  });
});

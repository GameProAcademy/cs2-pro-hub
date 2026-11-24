/** UX-1.6 / R-14, M-9 — radar alternative A. */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DnaRadarA, filledSectors, type RadarAxis } from "@/components/charts/DnaRadarA";
import { I18nProvider } from "@/i18n";
import { dictionaries } from "@/i18n/config";

const DIMS = [
  "aim",
  "dueling",
  "survivability",
  "positioning",
  "utility",
  "decision_making",
  "teamplay",
  "economy",
  "clutch",
  "consistency",
] as const;
const axes: RadarAxis[] = DIMS.map((d) => ({
  dimension: d,
  value: d === "economy" || d === "clutch" ? null : 60,
  status: d === "economy" ? "NOT_MEASURED" : d === "clutch" ? "NO_SAMPLE" : "MEASURED",
}));
const html = renderToString(
  <I18nProvider initialLocale="pt-BR">
    <DnaRadarA axes={axes} selected="aim" onSelect={() => {}} />
  </I18nProvider>,
);

describe("radar A", () => {
  it("always draws the ten axes, each selectable", () => {
    expect(html.match(/data-axis="/g)).toHaveLength(10);
    expect(html.match(/role="button"/g)).toHaveLength(10);
    expect(html).toContain('aria-pressed="true"');
  });

  it("marks empty axes dashed, without vertex, with their own status", () => {
    expect(html).toContain('data-axis-empty="NOT_MEASURED"');
    expect(html).toContain('data-axis-empty="NO_SAMPLE"');
    expect(html.match(/<circle[^>]*r="(3.5|5)"/g)).toHaveLength(8);
    expect(html).toContain(dictionaries["pt-BR"]["real.dna.status.NOT_MEASURED"]);
    expect(html).toContain(dictionaries["pt-BR"]["real.dna.status.NO_SAMPLE"]);
  });

  it("fills only sectors between two axes with a value", () => {
    // economy (7) and clutch (8) are empty: sectors 6-7, 7-8, 8-9 are not filled.
    expect(filledSectors(axes)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [9, 0],
    ]);
    expect(html.match(/data-sector=/g)).toHaveLength(7);
  });

  it("keeps every label inside the drawing", () => {
    const xs = [...html.matchAll(/<text x="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThan(60);
    expect(Math.max(...xs)).toBeLessThan(460);
  });
});

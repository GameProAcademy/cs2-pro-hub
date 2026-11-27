/**
 * VGL 2.0 continuation — Player DNA signature and snapshot trend. Sorting existing indexes is the
 * only operation; snapshots of another method or an incomplete profile never enter the trend.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DnaSignature,
  DnaTrend,
  comparableSnapshots,
  signature,
} from "@/components/cs2/DnaVisuals";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import type { DnaHistoryEntry } from "@/lib/xray.functions";

const r = (n: React.ReactNode) =>
  renderToString(<I18nProvider initialLocale="pt-BR">{n}</I18nProvider>);
const dims = [
  { dimension: "aim", value: 0.68 },
  { dimension: "dueling", value: 0.41 },
  { dimension: "clutch", value: null },
  { dimension: "utility", value: 0.55 },
  { dimension: "consistency", value: 0.66 },
  { dimension: "survivability", value: 0.35 },
] as const;

describe("signature", () => {
  it("sorts the real indexes and keeps missing dimensions apart", () => {
    const s = signature(dims as never);
    expect(s.top.map((d) => d.dimension)).toEqual(["aim", "consistency", "utility"]);
    expect(s.low.map((d) => d.dimension)).toEqual(["survivability", "dueling"]);
    expect(s.missing).toEqual(["clutch"]);
  });

  it("renders each index as written and a dashed bar with the em dash for no index", () => {
    const html = r(<DnaSignature dims={dims as never} />);
    expect(html).toContain(">68<");
    expect(html).toContain('data-dna-compare-missing="clutch"');
    expect(html).toContain("border-dashed");
    expect(html).not.toMatch(/percentil|percentile|rank/i);
  });

  it("is translated in the five locales", () => {
    const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
    for (const l of LOCALES)
      for (const k of [
        "vgl.dna.signature.title",
        "vgl.dna.signature.subtitle",
        "vgl.dna.signature.top",
        "vgl.dna.signature.low",
        "vgl.dna.signature.compare",
        "vgl.dna.signature.notMeasured",
        "vgl.dna.trend.title",
        "vgl.dna.trend.subtitle",
        "vgl.dna.trend.needTwo",
      ] as const)
        expect(dictionaries[l][k], `${l} ${k}`).toBeTruthy();
  });
});

describe("trend across snapshots", () => {
  const h = (
    createdAt: string,
    dnaVersion: string,
    state: string,
    aim: number | null,
  ): DnaHistoryEntry => ({
    createdAt,
    dnaVersion,
    state,
    matchCount: 5,
    roundCount: 100,
    dimensions: { aim },
  });
  const entries = [
    h("2026-11-20", "dna-weighted-v3", "READY", 60),
    h("2026-11-10", "dna-weighted-v2", "READY", 90),
    h("2026-11-22", "dna-weighted-v3", "INSUFFICIENT_SAMPLE", 10),
    h("2026-11-25", "dna-weighted-v3", "READY", 68),
  ];

  it("keeps only the same method with a complete profile, oldest first", () => {
    expect(comparableSnapshots(entries, "dna-weighted-v3").map((e) => e.createdAt)).toEqual([
      "2026-11-20",
      "2026-11-25",
    ]);
  });

  it("draws the persisted values and nothing with fewer than two comparable snapshots", () => {
    expect(r(<DnaTrend entries={entries} version="dna-weighted-v3" />)).toContain("60 → 68");
    expect(r(<DnaTrend entries={entries.slice(0, 2)} version="dna-weighted-v3" />)).toContain(
      "data-dna-trend-empty",
    );
  });
});

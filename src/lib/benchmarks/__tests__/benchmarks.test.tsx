/**
 * PM5 / 4.2.10 — module J: licence and comparability gates of `cs2.pro-benchmark.v1`, the
 * BENCHMARK_UNAVAILABLE state of the empty registry, and the status card in every locale.
 */
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProBenchmarkCard } from "@/components/benchmarks/ProBenchmarkCard";
import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import {
  AUDITED_SOURCES,
  COMPARABLE_METHOD,
  LICENSED_SOURCES,
  benchmarkStatus,
  compareToBenchmark,
  validateSource,
  type BenchmarkSource,
} from "@/lib/benchmarks/benchmarks";
import { releaseEntry } from "@/lib/metrics/metricContract";

const good: BenchmarkSource = {
  id: "fixture-licensed",
  name: "Fixture licensed source",
  license: {
    kind: "COMMERCIAL_AGREEMENT",
    reference: "contract-fixture",
    allowsDerivedDisplay: true,
    verifiedAt: "2026-11-18",
  },
  game: "CS2",
  collection: "LICENSED_EXPORT",
  methodVersion: COMPARABLE_METHOD,
  sampleMatches: 500,
  metrics: [{ key: "hsPercent", value: 45, matches: 500 }],
};

describe("validateSource", () => {
  it("accepts only a verified, licensed, authorised, comparable source", () => {
    expect(validateSource(good)).toEqual({ valid: true, reasons: [] });
    const cases: Array<[Partial<BenchmarkSource>, string]> = [
      [{ license: { ...good.license, kind: "NONE" } }, "LICENSE_MISSING"],
      [{ license: { ...good.license, reference: null } }, "LICENSE_MISSING"],
      [
        { license: { ...good.license, allowsDerivedDisplay: false } },
        "DERIVED_DISPLAY_NOT_ALLOWED",
      ],
      [{ license: { ...good.license, verifiedAt: null } }, "LICENSE_NOT_VERIFIED"],
      [{ collection: "SCRAPED" }, "SCRAPED"],
      [{ collection: "UNKNOWN" }, "SCRAPED"],
      [{ game: "CSGO" }, "NOT_CS2"],
      [{ methodVersion: "hltv.rating.2" }, "METHOD_NOT_COMPARABLE"],
      [{ sampleMatches: 29 }, "SAMPLE_TOO_SMALL"],
    ];
    for (const [patch, reason] of cases) {
      const r = validateSource({ ...good, ...patch });
      expect(r.valid).toBe(false);
      expect(r.reasons).toContain(reason);
    }
  });
});

describe("compareToBenchmark", () => {
  it("is BENCHMARK_UNAVAILABLE with the real (empty) registry", () => {
    expect(LICENSED_SOURCES).toHaveLength(0);
    expect(compareToBenchmark("hsPercent", 40)).toEqual({
      state: "BENCHMARK_UNAVAILABLE",
      metricKey: "hsPercent",
      reason: "NO_LICENSED_SOURCE",
    });
    expect(benchmarkStatus().state).toBe("BENCHMARK_UNAVAILABLE");
    expect(releaseEntry("pro.benchmark")?.release).toBe("UNAVAILABLE");
  });

  it("never uses a scraped or unlicensed source even when it has the metric", () => {
    const scraped = { ...good, collection: "SCRAPED" as const };
    expect(compareToBenchmark("hsPercent", 40, [scraped]).state).toBe("BENCHMARK_UNAVAILABLE");
  });

  it("compares only covered metrics with a known player value", () => {
    expect(compareToBenchmark("hsPercent", 40, [good])).toMatchObject({
      state: "OK",
      proValue: 45,
      proMatches: 500,
      delta: -5,
      licenseReference: "contract-fixture",
    });
    expect(compareToBenchmark("kd", 1.1, [good])).toMatchObject({ reason: "METRIC_NOT_COVERED" });
    expect(compareToBenchmark("hsPercent", null, [good])).toMatchObject({
      reason: "PLAYER_VALUE_MISSING",
    });
  });

  it("documents every audited candidate with at least one finding", () => {
    expect(AUDITED_SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const s of AUDITED_SOURCES) expect(s.findings.length).toBeGreaterThan(0);
  });
});

const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];
const render = (node: ReactNode, locale: Locale) =>
  renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);

describe("ProBenchmarkCard", () => {
  it("states the unavailability and the audit without any number or raw key", () => {
    for (const locale of LOCALES) {
      const html = render(<ProBenchmarkCard />, locale);
      expect(html).toContain('data-benchmark-state="BENCHMARK_UNAVAILABLE"');
      expect(html).toContain("HLTV.org");
      expect(html).not.toMatch(/benchmarks\.[a-z]/);
    }
  });

  it("switches to the available state only when a valid source exists", () => {
    const html = render(<ProBenchmarkCard status={benchmarkStatus([good])} />, "en");
    expect(html).toContain('data-benchmark-state="AVAILABLE"');
  });
});

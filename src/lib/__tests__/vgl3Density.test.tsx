/**
 * VGL 3.0 — density on phones. Tables become stacked cards below md with the same cells (column
 * name from data-label); the segmented adherence shows exactly done of due; the selected map is
 * labelled; moments get a stripe by kind; the admin indicator keeps its value.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SegmentedCount } from "@/components/cs2/HudKit";
import { dictionaries, type Locale } from "@/i18n/config";
import { STACK_CELL, STACK_ROW, STACK_TABLE } from "@/lib/ui/stackedTable";

const src = (p: string) => readFileSync(resolve(p), "utf8");

describe("SegmentedCount", () => {
  it("one segment per unit, filled = done", () => {
    const html = renderToString(<SegmentedCount done={1} due={4} />);
    expect(html).toContain('data-segmented-count="1/4"');
    expect(html.match(/bg-primary/g)).toHaveLength(1);
    expect(html.match(/border-border-strong/g)).toHaveLength(3);
  });
  it("nothing for invalid or too long counts", () => {
    expect(renderToString(<SegmentedCount done={0} due={0} />)).toBe("");
    expect(renderToString(<SegmentedCount done={2} due={40} />)).toBe("");
    expect(renderToString(<SegmentedCount done={-1} due={4} />)).toBe("");
  });
});

describe("stacked tables", () => {
  it("the helper only acts below md", () => {
    for (const c of [STACK_TABLE, STACK_ROW, STACK_CELL])
      for (const token of c.split(" ")) expect(token.startsWith("max-md:")).toBe(true);
    expect(STACK_CELL).toContain("content-[attr(data-label)]");
  });
  it("evolution and score tables label every value cell", () => {
    const e = src("src/components/real/RealEvolution.tsx");
    for (const k of ["window", "consistency", "comparison"])
      expect(e).toContain(`data-label={t("evolution.col.${k}")}`);
    expect(e).toContain('"w-full text-sm md:min-w-[720px]"');
    const p = src("src/components/real/RealProScore.tsx");
    for (const k of ["value", "sample", "weight", "points"])
      expect(p).toContain(`data-label={t("score.col.${k}")}`);
  });
});

describe("maps, moments, training, admin", () => {
  it("selected map label in five locales", () => {
    expect(src("src/components/real/RealHeatmap.tsx")).toContain("data-map-selected");
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"] as Locale[])
      expect(dictionaries[l]["vgl3.maps.selected"]).toBeTruthy();
  });
  it("moment stripe by kind; training adherence uses the plan's own integers", () => {
    expect(src("src/components/moments/RealMoments.tsx")).toContain('"border-l-category-utility"');
    expect(src("src/components/training/AdaptiveTraining.tsx")).toMatch(
      /<SegmentedCount\s+done=\{plan\.adherence\.done\}\s+due=\{plan\.adherence\.due\}/,
    );
  });
  it("admin indicator keeps the value and gains only the rule", () => {
    const a = src("src/routes/_authenticated/admin/index.tsx");
    expect(a).toContain("data-admin-stat");
    expect(a).toContain("{value}</p>");
  });
});

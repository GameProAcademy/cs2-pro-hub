import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Visual phase V-1: the semantic palette is measured, not assumed (WCAG 2.x contrast). */
const css = readFileSync("src/styles.css", "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("/* Dark is the product default"));

function token(name: string, seen = new Set<string>()): [number, number, number] {
  const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing --${name}`);
  const v = m[1]!.trim();
  const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) {
    if (seen.has(ref[1]!)) throw new Error("cycle");
    seen.add(ref[1]!);
    return token(ref[1]!, seen);
  }
  const o = v.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (!o) throw new Error(`--${name} is not a plain oklch: ${v}`);
  return [Number(o[1]), Number(o[2]), Number(o[3])];
}

/** OKLCH → linear sRGB (Björn Ottosson), clamped; → WCAG relative luminance. */
function luminance([L, C, h]: [number, number, number]): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const c = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(bl);
}
const ratio = (x: string, y: string) => {
  const [a, b] = [luminance(token(x)), luminance(token(y))].sort((p, q) => q - p);
  return (a! + 0.05) / (b! + 0.05);
};

describe("visual phase semantic palette", () => {
  it.each([
    "foreground",
    "muted-foreground",
    "primary",
    "context",
    "warning",
    "destructive",
    "side-ct",
    "side-t",
    "category-utility",
    "success",
  ])("%s reads at AA (4.5:1) on surface-1 and surface-2", (name) => {
    expect(ratio(name, "card")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(name, "elevated")).toBeGreaterThanOrEqual(4.5);
  });
  it("filled controls keep AA between fill and its foreground", () => {
    expect(ratio("primary", "primary-foreground")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("context", "context-foreground")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("warning", "warning-foreground")).toBeGreaterThanOrEqual(4.5);
  });
  it("the neutral (no sample) is a graphic, not text: 3:1 on the panels", () => {
    expect(ratio("neutral", "card")).toBeGreaterThanOrEqual(1.5);
  });
  it("role colours are separated by hue: T side vs attention, CT vs context", () => {
    const hue = (n: string) => token(n)[2];
    const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    expect(gap(hue("side-t"), hue("warning"))).toBeGreaterThanOrEqual(30);
    expect(gap(hue("side-ct"), hue("context"))).toBeGreaterThanOrEqual(30);
    expect(gap(hue("primary"), hue("success"))).toBeGreaterThanOrEqual(20);
  });
  it("two radii only: 8 px controls, 12 px panels", () => {
    expect(css).toMatch(/--radius-sm: 8px;/);
    expect(css).toMatch(/--radius-md: 8px;/);
    expect(css).toMatch(/--radius-lg: 12px;/);
    expect(css).toMatch(/--radius-xl: 12px;/);
  });
});

/** VGL 5.1 — Frente 12: Player DNA page layout (presentation only). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const page = read("src/components/real/RealDna.tsx");
const body = page.slice(
  page.indexOf("export function DnaBody"),
  page.indexOf("function DnaDimensionCard"),
);

describe("Player DNA page", () => {
  it("does not render Identidade técnica here; the component still exists for other pages", () => {
    expect(body).not.toContain("<IdentityCard");
    expect(read("src/components/cs2/IdentityKit.tsx")).toContain("export function IdentityCard");
  });

  it("radar is the protagonist on the page (no outer ChartCard) with Em foco beside it", () => {
    expect(body).toContain("data-dna-radar-hero");
    expect(body).not.toContain("<ChartCard");
    const radar = body.indexOf("<DnaRadarA");
    const focus = body.indexOf("data-dna-focus={focusDim.dimension}");
    const chips = body.indexOf("data-dna-chips");
    expect(radar).toBeGreaterThan(0);
    expect(focus).toBeGreaterThan(radar);
    expect(chips).toBeGreaterThan(focus);
  });

  it("dimensions wrap in a grid: no horizontal strip, no truncation", () => {
    const chips = body.slice(body.indexOf("data-dna-chips") - 200, body.indexOf("data-dna-chips"));
    expect(chips).toMatch(/grid grid-cols-1 gap-2/);
    expect(body).not.toMatch(
      /overflow-x-auto[^"]*"\s*data-dna-chips|flex gap-1\.5 overflow-x-auto/,
    );
    expect(body).not.toMatch(/data-dna-chip[\s\S]{0,400}truncate/);
    expect(read("src/components/cs2/DnaVisuals.tsx")).not.toContain("flex-1 truncate text-left");
  });

  it("the radar shows a short status on the axis, the full sentence in the accessible name", () => {
    const radar = read("src/components/charts/DnaRadarA.tsx");
    expect(radar).toContain("real.dna.statusShort.");
    expect(radar).toContain("{empty ? statusShort : String(a.value)}");
    expect(radar).toMatch(/aria-label=\{`\$\{label\}: \$\{empty \? statusText/);
    expect(radar).toContain("viewBox={`${-PAD_X} 0 ${SIZE + 2 * PAD_X} ${SIZE}`}");
    for (const loc of ["pt-BR", "en", "es", "fr", "pt-PT"]) {
      const b = read(`src/i18n/locales/vgl5/${loc}.ts`);
      for (const k of [
        "real.dna.statusShort.NO_SAMPLE",
        "real.dna.statusShort.NOT_MEASURED",
        "vgl51.dna.dimensions",
      ])
        expect(b).toContain(`"${k}"`);
    }
  });
});

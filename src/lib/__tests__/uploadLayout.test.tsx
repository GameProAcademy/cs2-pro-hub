/**
 * /upload visual evolution — E2 layout. The "how it works" column exists only from 1280 px,
 * holds the three real steps and links to the screens that use an analysed match, and the
 * structure below 1280 px is the one validated before (same single column, same classes).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      className,
    }: {
      to: string;
      children: React.ReactNode;
      className?: string;
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  };
});
const { UploadLoop } = await import("@/components/pipeline/UploadLoop");

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const ROUTE = readFileSync(join(process.cwd(), "src/routes/_authenticated/upload.tsx"), "utf8");
const render = (l: Locale) =>
  renderToString(
    <I18nProvider initialLocale={l}>
      <UploadLoop />
    </I18nProvider>,
  );

describe("/upload layout (E2)", () => {
  it("the loop renders three numbered steps in order", () => {
    const html = render("pt-BR");
    const steps = [...html.matchAll(/data-loop-step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(["send", "process", "use"]);
    for (const n of ["01", "02", "03"]) expect(html).toContain(`>${n}<`);
    expect(html).toContain("data-upload-loop");
  });

  it("links to the three screens that use an analysed match, with their navigation names", () => {
    const html = render("pt-BR");
    for (const to of ["/analysis", "/player-dna", "/training"])
      expect(html).toContain(`href="${to}"`);
    for (const k of ["nav.analysis", "nav.playerDna", "nav.training"] as const)
      expect(html).toContain(dictionaries["pt-BR"][k]);
  });

  it("is translated in the five locales and carries no number or example data", () => {
    for (const l of LOCALES) {
      const html = render(l);
      expect(html, l).toContain(dictionaries[l]["analyze.loop.title"]);
      const text = html.replace(/<[^>]+>/g, " ").replace(/&#x?[0-9a-f]+;/gi, "");
      // Only the step numbers and the ".dem" extension; never a value, percentage or score.
      expect(text.replace(/\b0[1-3]\b/g, ""), l).not.toMatch(/\d/);
    }
  });

  it("icons are decorative and motion respects reduced-motion", () => {
    const html = render("pt-BR");
    expect(html.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("the aside exists only from 1280 px; below it the column and its classes are unchanged", () => {
    expect(ROUTE).toMatch(
      /<aside className="hidden xl:block xl:self-stretch" data-upload-loop-rail>\s*<div className="xl:sticky xl:top-24">\s*<UploadLoop \/>/,
    );
    expect(ROUTE).toContain(
      'className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start"',
    );
    // Every non-xl class of the 9d86fecf structure is still there.
    expect(ROUTE).toContain(
      '<div ref={intakeRef} tabIndex={-1} className="scroll-mt-24 outline-none">',
    );
    expect(ROUTE).toContain('className="lg:col-span-3 xl:col-span-2"');
    expect(ROUTE).toContain("<DemoIngestPanel identifyJobId={identify} />");
  });

  it("the sticky column is bounded by the intake row, never by the whole grid", () => {
    // A sticky element is limited by its containing block. On the grid item itself that block
    // is the whole grid (intake row + "Fontes de dados"), which let the column slide over the
    // sources card. The aside now stretches over the intake row only and the sticky element
    // is its child, so it stops at the end of that row.
    const aside = ROUTE.slice(ROUTE.indexOf("<aside"), ROUTE.indexOf("</aside>"));
    expect(aside).not.toMatch(/<aside[^>]*sticky/);
    expect(aside).toContain("xl:self-stretch");
    expect(aside.match(/xl:sticky/g)).toHaveLength(1);
    expect(ROUTE.indexOf("</aside>")).toBeLessThan(ROUTE.indexOf('t("sources.title")'));
  });
});

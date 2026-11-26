/**
 * /upload visual evolution — E3 "Fontes de dados". Source and Gamers Club states are the shared
 * ToneBadge (text always present, colour never alone); the texts, the registry decision and the
 * link validator are unchanged.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GamersClubPanel } from "@/components/integrations/GamersClubPanel";
import { DISPLAYED_SOURCES, SourcesPanel } from "@/components/pipeline/SourcesPanel";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { describeSource } from "@/lib/sources/registry";
import { DATA_SOURCES } from "@/lib/sources/sources";

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const OLD_CHIP = "rounded-md border px-2 py-1";
const render = (l: Locale, node: React.ReactNode) =>
  renderToString(<I18nProvider initialLocale={l}>{node}</I18nProvider>);

describe("/upload sources (E3)", () => {
  it("each source state is a ToneBadge with the same text the registry decides", () => {
    for (const l of LOCALES) {
      const html = render(l, <SourcesPanel />);
      expect(html, l).not.toContain(OLD_CHIP);
      const states = [...html.matchAll(/data-tone="([a-z]+)"[^>]*data-source-state="([a-z]+)"/g)];
      expect(
        states.map((m) => m[2]),
        l,
      ).toEqual(
        DISPLAYED_SOURCES.map((s) => (describeSource(s).implemented ? "active" : "prepared")),
      );
      for (const m of states) expect(m[1]).toBe(m[2] === "active" ? "context" : "neutral");
      expect(html, l).toContain(esc(dictionaries[l]["sources.state.active"]));
      expect(html, l).toContain(esc(dictionaries[l]["sources.state.prepared"]));
      expect(html, l).toContain(esc(dictionaries[l]["sources.notAvailable"]));
      expect(html, l).toContain(esc(dictionaries[l]["sources.privacy"]));
    }
  });

  it("Gamers Club state is a ToneBadge with icon and text", () => {
    for (const l of LOCALES) {
      const html = render(l, <GamersClubPanel />);
      expect(html, l).not.toContain(OLD_CHIP);
      expect(html, l).toMatch(/data-tone="attention"[^>]*data-gc-state="blocked"/);
      expect(html, l).toContain(esc(dictionaries[l]["gc.state.blocked"]));
    }
  });

  it("the notice no longer contradicts the FACEIT state (text only; registry unchanged)", () => {
    expect(describeSource("faceit").implemented).toBe(true);
    for (const l of LOCALES) {
      const text = dictionaries[l]["sources.notAvailable"];
      expect(text, l).toContain("FACEIT");
      expect(text, l).not.toMatch(
        /nenhuma integra|no external|ninguna integra|aucune int|única fonte|only working|única fuente|seule source/i,
      );
    }
  });

  it("the public profile source and its link form are no longer shown (presentation only)", () => {
    // The internal id stays registered; only the /upload list hides it.
    expect(DATA_SOURCES).toContain("public_profile");
    expect(DISPLAYED_SOURCES).toEqual(["demo", "faceit", "gamers_club", "steam"]);
    for (const l of LOCALES) {
      const html = render(l, <SourcesPanel />);
      expect(html, l).not.toContain(esc(dictionaries[l]["sources.source.public_profile"]));
      expect(html, l).not.toContain('id="public-profile-url"');
      expect(html, l).not.toContain(esc(dictionaries[l]["sources.publicProfile.label"]));
      expect(html, l).not.toContain(esc(dictionaries[l]["sources.publicProfile.validate"]));
      expect(html, l).not.toContain(esc(dictionaries[l]["sources.publicProfile.notice"]));
      expect(html, l).not.toMatch(/<input|<button/);
      for (const kept of ["demo", "faceit", "gamers_club", "steam"] as const)
        expect(html, l).toContain(esc(dictionaries[l][`sources.source.${kept}`]));
    }
  });

  it("Gamers Club keeps its own public-profile form", () => {
    const html = render("pt-BR", <GamersClubPanel />);
    expect(html).toMatch(/<input/);
  });
});

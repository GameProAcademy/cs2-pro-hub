/**
 * /upload visual evolution — E1 copy. The page no longer promises the removed statistics/prints
 * path, the drop zone tells the truth about when the upload starts, and the Gamers Club panel
 * shows a translated architecture state instead of the raw enum.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GamersClubPanel } from "@/components/integrations/GamersClubPanel";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const ROUTE = readFileSync(join(process.cwd(), "src/routes/_authenticated/upload.tsx"), "utf8");
const REMOVED_PATH =
  /estat[ií]stic|statisti|stats|estad[ií]stic|statistiq|prints|screenshot|relat[oó]rio|report|informe|rapport/i;

describe("/upload copy (E1)", () => {
  it("the page description names only the demo path, in every locale", () => {
    for (const l of LOCALES) {
      const text = dictionaries[l]["analyze.description"];
      expect(text, l).toMatch(/\.dem/);
      expect(text, l).not.toMatch(REMOVED_PATH);
    }
  });

  it("the route metadata no longer mentions prints or reports", () => {
    const head = ROUTE.slice(ROUTE.indexOf("head:"), ROUTE.indexOf("component:"));
    expect(head).not.toMatch(REMOVED_PATH);
    expect(head).toContain(".dem");
  });

  it("the drop zone no longer says the file is not sent", () => {
    for (const l of LOCALES) {
      const text = dictionaries[l]["analyze.notSent"];
      expect(text, l).not.toMatch(/não é enviado|neither|no se envía|ni envoyé|não é enviado/i);
    }
    expect(dictionaries["pt-BR"]["analyze.notSent"]).toBe(
      "O envio começa assim que você seleciona o arquivo.",
    );
  });

  it("the intake card has its own player-facing title, the pipeline keys stay untouched", () => {
    expect(ROUTE).toContain('t("analyze.intake.title")');
    expect(ROUTE).not.toContain('t("pipeline.title")');
    for (const l of LOCALES) {
      expect(dictionaries[l]["analyze.intake.title"].length, l).toBeGreaterThan(0);
      expect(dictionaries[l]["analyze.intake.subtitle"], l).toContain(".dem");
    }
  });

  it("Gamers Club shows a translated architecture state, never the raw enum", () => {
    for (const l of LOCALES) {
      const html = renderToString(
        <I18nProvider initialLocale={l}>
          <GamersClubPanel />
        </I18nProvider>,
      );
      expect(html, l).not.toContain("architecture_ready");
      expect(html, l).toContain(dictionaries[l]["gc.architecture.architecture_ready"]);
    }
  });
});

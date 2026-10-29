import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { CoachText } from "@/components/coach/RealCoachChat";
import { COACH_LOCALES, buildCoachFacts } from "../coach/coachContext";
import { coachBlocks, inlineParts, plainMath } from "../coach/coachText";
import { formatSignalValue } from "../dnaFormat";
import { DNA_SIGNAL_LABELS, signalLabel } from "../dnaSignalLabels";
import { buildPlayerDna } from "../playerDna";
import { FEATURE_CATALOG } from "../pipeline/features.catalog";
import type { PlayerOverview } from "../playerOverview";

const SIGNALS = Object.values(FEATURE_CATALOG).flatMap((d) => Object.keys(d));

describe("Player DNA signal labels", () => {
  it("every catalogued signal has a label in all five locales, never its id", () => {
    expect(COACH_LOCALES.sort()).toEqual(["en", "es", "fr", "pt-BR", "pt-PT"]);
    for (const locale of COACH_LOCALES) {
      for (const name of SIGNALS) {
        const label = signalLabel(name, locale);
        expect(DNA_SIGNAL_LABELS[locale][name], `${locale}:${name}`).toBeTruthy();
        expect(label).not.toBe(name);
        expect(label).not.toMatch(/^[a-z]+(_[a-z]+)+$/);
      }
    }
  });

  it("an unknown signal gets a generic localized label, not the id", () => {
    expect(signalLabel("brand_new_signal", "pt-BR")).toBe("Outro sinal técnico");
    expect(signalLabel("brand_new_signal", "en")).toBe("Other technical signal");
    expect(signalLabel("brand_new_signal", "fr")).not.toContain("brand_new_signal");
  });

  it("values keep zero, unknown and index semantics", () => {
    const yn = { yes: "Sim", no: "Não" };
    expect(formatSignalValue("hs_rate", null, "ratio", yn)).toBe("—");
    expect(formatSignalValue("hs_rate", 0, "ratio", yn)).toBe("0.0%");
    expect(formatSignalValue("hs_rate", 0.577, "ratio", yn)).toBe("57.7%");
    // Reference-scaled signals are an index, never a percentage.
    expect(formatSignalValue("damage_per_round", 0.845, "rate", yn)).toBe("85 / 100");
    expect(formatSignalValue("damage_efficiency", 0.49, "ratio", yn)).toBe("49 / 100");
    expect(formatSignalValue("rating", 0.498, "ratio", yn)).toBe("50 / 100");
    expect(formatSignalValue("utility_damage_per_round", 0.235, "rate", yn)).toBe("24 / 100");
    // Shares of rounds stay percentages; kills per round is the plain number.
    expect(formatSignalValue("opening_participation", 0.127, "rate", yn)).toBe("12.7%");
    expect(formatSignalValue("kills_per_round", 0.626, "rate", yn)).toBe("0.63");
    expect(formatSignalValue("early_window_seconds", 20, "seconds", yn)).toBe("20 s");
    expect(formatSignalValue("economy_data_available", 1, "flag", yn)).toBe("Sim");
  });

  it("the DNA page renders labels, not signal ids", () => {
    const page = readFileSync(resolve(__dirname, "../../components/real/RealDna.tsx"), "utf8");
    expect(page).toContain("signalLabel(s.name, locale)");
    expect(page).not.toMatch(/>\{s\.name\}</);
  });

  it("the coach facts carry localized labels and shown values, never internal ids", () => {
    const rows = ["a", "b", "c"].map((id) => ({
      match_id: id,
      partial_parse: false,
      sample_rounds: 24,
      features: {
        clutch: { clutch_win_rate: 0.167 },
        aim: { hs_rate: 0.5, damage_per_round: 0.845 },
      },
    }));
    const overview = { matches: [], aggregates: null } as unknown as PlayerOverview;
    const facts = buildCoachFacts(overview, buildPlayerDna(rows), "pt-BR");
    const json = JSON.stringify(facts.playerDna);
    for (const name of SIGNALS) expect(json).not.toContain(`"${name}"`);
    expect(json).toContain("Vitórias em clutch");
    expect(json).toContain("16.7%");
    expect(json).toContain("85 / 100");
    expect(
      JSON.stringify(buildCoachFacts(overview, buildPlayerDna(rows), "en").playerDna),
    ).toContain("Clutches won");
  });
});

describe("Coach reply rendering", () => {
  it("rewrites LaTeX into plain text", () => {
    expect(plainMath("\\[ \\text{K/D} = \\frac{\\text{kills}}{\\text{deaths}} \\]")).toBe(
      " K/D = kills / deaths ",
    );
    expect(plainMath("$\\frac{12}{14} \\approx 0.86$")).toBe("12 / 14 ≈ 0.86");
    expect(plainMath("KAST = \\frac{K + A + S + T}{rounds} \\times 100\\%")).toBe(
      "KAST = (K + A + S + T) / rounds × 100%",
    );
    expect(plainMath("custa $5 e $10")).toBe("custa $5 e $10"); // money untouched
    expect(plainMath("texto normal, 57,7% e K/D 0.86")).toBe("texto normal, 57,7% e K/D 0.86");
  });

  it("incomplete delimiters degrade to readable text", () => {
    const out = plainMath("\\frac{a}{b and $\\text{x");
    expect(out).not.toContain("\\text");
    expect(out).toContain("frac");
  });

  it("parses headings, bullets, tables and multilingual text", () => {
    const blocks = coachBlocks(
      "## Dados\n- **Rating** 0.63\n\n| Mapa | Rating |\n|---|---|\n| de_dust2 | 1.01 |\n| de_cache | 0.63 |\n\nRecomendação: treine trocas. Évitez les morts précoces.",
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "bullet",
      "space",
      "table",
      "space",
      "paragraph",
    ]);
    const table = blocks[3] as { kind: "table"; header: string[]; rows: string[][] };
    expect(table.header).toEqual(["Mapa", "Rating"]);
    expect(table.rows).toEqual([
      ["de_dust2", "1.01"],
      ["de_cache", "0.63"],
    ]);
  });

  it("malformed markdown and ragged tables never throw", () => {
    expect(() => coachBlocks("| a | b |\n|---|\n| 1 |\n**unclosed\n# \n- \n|||")).not.toThrow();
    expect(inlineParts("**bold** and `code` and *stray")).toEqual([
      { kind: "bold", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
      { kind: "text", text: " and *stray" },
    ]);
  });

  it("model output can never become HTML (script, img, attributes are escaped text)", () => {
    const html = renderToStaticMarkup(
      createElement(CoachText, {
        content:
          "<script>alert(1)</script>\n| <img src=x onerror=alert(1)> | b |\n|---|---|\n| **<b>x</b>** | `<i>` |",
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<table");
  });
});

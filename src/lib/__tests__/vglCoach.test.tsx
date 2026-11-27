/**
 * Visual Game Language — AI Coach, presentation only. Sections the Coach itself titled become
 * tactical panels; numbers are set in mono; no word of the reply is added, removed or reordered.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoachText } from "@/components/coach/RealCoachChat";
import { coachSectionKind, numericParts } from "@/lib/coach/coachSections";

const visibleText = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("section classifier (five locales)", () => {
  it.each([
    ["Dados observados", "observed"],
    ["What the data shows", "observed"],
    ["Datos", "observed"],
    ["Données observées", "observed"],
    ["Interpretação", "interpretation"],
    ["Analysis", "interpretation"],
    ["Análisis", "interpretation"],
    ["Ce que cela signifie", "interpretation"],
    ["Próxima ação", "action"],
    ["Next steps", "action"],
    ["Plano de treino", "action"],
    ["Prochaines étapes", "action"],
    ["Pontos fortes", "strength"],
    ["Strengths", "strength"],
    ["Puntos fuertes", "strength"],
    ["Points forts", "strength"],
    ["Pontos a melhorar", "weakness"],
    ["Weaknesses", "weakness"],
    ["Para mejorar", "weakness"],
    ["À améliorer", "weakness"],
  ] as const)("%s → %s", (heading, kind) => {
    expect(coachSectionKind(heading)).toBe(kind);
  });

  it("leaves any other heading alone", () => {
    expect(coachSectionKind("Mirage, rodada 7")).toBeNull();
    expect(coachSectionKind("Resumo")).toBeNull();
  });
});

describe("numbers", () => {
  it("splits numeric runs without touching words or the rest of the text", () => {
    const parts = numericParts("ADR 85,3 e KAST 72% em 2 partidas; HS% alto, CS2 ok");
    expect(parts.map((p) => p.text).join("")).toBe(
      "ADR 85,3 e KAST 72% em 2 partidas; HS% alto, CS2 ok",
    );
    expect(parts.filter((p) => p.kind === "number").map((p) => p.text)).toEqual([
      "85,3",
      "72%",
      "2",
    ]);
  });
});

describe("CoachText", () => {
  const reply = [
    "Olá! Analisei suas partidas.",
    "## Dados observados",
    "- ADR **85,3** em 3 partidas",
    "## Interpretação",
    "Você entra bem nos duelos.",
    "## Próxima ação",
    "- Treine pré-mira na Mirage",
    "## Mirage",
    "Texto livre.",
  ].join("\n");

  it("turns the Coach's own sections into panels and keeps other headings plain", () => {
    const html = renderToString(<CoachText content={reply} />);
    expect(html).toContain('data-coach-section="observed"');
    expect(html).toContain('data-coach-section="interpretation"');
    expect(html).toContain('data-coach-section="action"');
    expect(html.match(/data-coach-section=/g)).toHaveLength(3);
    expect(html.match(/data-coach-heading/g)).toHaveLength(4);
    expect(html).toContain("data-coach-number");
  });

  it("renders exactly the same words in the same order", () => {
    const before = visibleText(renderToString(<CoachText content={reply} />));
    const expected =
      "Olá! Analisei suas partidas. Dados observados ADR 85,3 em 3 partidas Interpretação " +
      "Você entra bem nos duelos. Próxima ação Treine pré-mira na Mirage Mirage Texto livre.";
    expect(before).toBe(expected);
  });

  it("is still text nodes only (no HTML from the reply)", () => {
    const html = renderToString(<CoachText content={"## Dados\n<script>alert(1)</script>"} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

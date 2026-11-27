/**
 * VGL 2.0 continuation — AI Coach replies without headings, long replies, numbers and in-text
 * references. The decoration never adds, removes or reorders a character of the reply.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoachText } from "@/components/coach/RealCoachChat";
import { coachTokens } from "@/lib/coach/coachSections";

const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
// Same characters in the same order; only whitespace (layout) is ignored.
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/^- /gm, "").replace(/\s+/g, "");

const noHeadings =
  "Nas suas 10 partidas, seu ADR médio foi 79,6 e o KAST 71%.\n" +
  "Na Mirage você morreu cedo como TR em 6 rounds; com a AWP seu impacto foi maior do que com a AK-47.\n" +
  "- Revise as mortes no bomb A da Inferno\n" +
  "- Treine trocas como CT com a M4A1-S e a USP-S";

describe("coachTokens", () => {
  it("joins back to exactly the input", () => {
    expect(
      coachTokens(noHeadings)
        .map((p) => p.text)
        .join(""),
    ).toBe(noHeadings);
  });

  it("recognises maps, unambiguous weapons, capital CT/TR and numbers", () => {
    const kinds = coachTokens(noHeadings).filter((p) => p.kind !== "text");
    expect(kinds.filter((p) => p.kind === "map").map((p) => (p as { map: string }).map)).toEqual([
      "de_mirage",
      "de_inferno",
    ]);
    expect(
      kinds.filter((p) => p.kind === "weapon").map((p) => (p as { weapon: string }).weapon),
    ).toEqual(["awp", "ak47", "m4a1_silencer", "usp_silencer"]);
    expect(kinds.filter((p) => p.kind === "side").map((p) => p.text)).toEqual(["TR", "CT"]);
    expect(kinds.filter((p) => p.kind === "number").map((p) => p.text)).toEqual([
      "10",
      "79,6",
      "71%",
      "6",
    ]);
  });

  it("never guesses ambiguous names or lower-case side words", () => {
    const parts = coachTokens("m4a1 e M4A4, ct e tr, contra o trem");
    expect(parts.filter((p) => p.kind === "weapon")).toEqual([]);
    expect(parts.filter((p) => p.kind === "side")).toEqual([]);
  });
});

describe("CoachText", () => {
  it("a reply without headings: lead paragraph, decorations, same text", () => {
    const html = renderToString(<CoachText content={noHeadings} />);
    expect(html).toContain("data-coach-lead");
    expect(html).toContain('data-coach-map="de_mirage"');
    expect(html).toContain('data-coach-weapon="awp"');
    expect(html).toContain('data-coach-side="CT"');
    expect(html).not.toContain("data-coach-section");
    expect(visible(html)).toBe(plain(noHeadings));
  });

  it("a long reply renders every paragraph and character", () => {
    const long = Array.from(
      { length: 60 },
      (_, i) => `Parágrafo ${i + 1}: ADR ${70 + i} na Nuke como CT.`,
    ).join("\n\n");
    const html = renderToString(<CoachText content={long} />);
    expect(visible(html)).toBe(plain(long));
    expect(html.match(/data-coach-map="de_nuke"/g)).toHaveLength(60);
  });
});

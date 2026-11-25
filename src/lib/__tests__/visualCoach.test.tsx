/**
 * Visual phase — Coach: the model's light Markdown keeps its structure with the new styling
 * (heading rule, bullet dots, bordered table with a header row, inline code) and stays text-only
 * (no HTML from the model is ever rendered as markup).
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoachText } from "@/components/coach/RealCoachChat";

describe("visual phase — Coach text", () => {
  const html = renderToString(
    <CoachText
      content={[
        "## Diagnóstico",
        "- **ADR** abaixo da sua média",
        "- use `bind` para treinar",
        "",
        "| Métrica | Valor |",
        "| --- | --- |",
        "| KAST | 70,5% |",
        "",
        "<b>não é HTML</b>",
      ].join("\n")}
    />,
  );

  it("renders headings, bullets, code and tables with the new structure", () => {
    expect(html).toContain("data-coach-heading");
    expect((html.match(/data-coach-bullet/g) ?? []).length).toBe(2);
    expect(html).toContain("<strong>ADR</strong>");
    expect(html).toMatch(/<code[^>]*bg-elevated[^>]*>bind<\/code>/);
    expect(html).toContain("data-coach-table");
    expect(html).toMatch(/<th[^>]*>Métrica<\/th>/);
    expect(html).toContain("70,5%");
  });

  it("never renders model HTML as markup", () => {
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
});

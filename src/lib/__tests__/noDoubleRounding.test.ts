import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format";

/** Production, Cache match of the test account: 7 headshot kills of 13 (exact 53.846 %). */
describe("ratios are not rounded twice before display", () => {
  const sixDecimals = Math.round((7 / 13) * 1_000_000) / 1_000_000;
  const fourDecimals = Math.round((7 / 13) * 10000) / 10000;
  it("6 decimals keep the displayed one-decimal percentage exact", () => {
    expect(formatNumber(sixDecimals * 100, "pt-BR", 1)).toBe("53,8");
    // What the 4-decimal value showed on the Duels tab (and the Coach, from hs_percent, did not).
    expect(formatNumber(fourDecimals * 100, "pt-BR", 1)).toBe("53,9");
  });
  it("duels and utility use 6 decimals", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/combat/duels.ts", "utf8")).toContain("* 1_000_000) / 1_000_000");
    expect(readFileSync("src/lib/utility/utility.ts", "utf8")).toContain(
      "* 1_000_000) / 1_000_000",
    );
  });
});

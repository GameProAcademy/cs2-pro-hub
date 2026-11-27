/**
 * Visual Game Language — Goals. The empty state illustration is decorative, the status badge keeps
 * its word, and no progress fraction is computed in the UI (only the server's own status/value).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const panel = readFileSync(
  join(process.cwd(), "src/components/notifications/GoalsPanel.tsx"),
  "utf8",
);

describe("goals (VGL)", () => {
  it("empty state draws a decorative illustration next to the existing copy", () => {
    expect(panel).toMatch(/<svg[\s\S]*?aria-hidden[\s\S]*?data-goals-illustration/);
    expect(panel).toContain('{t("goals.empty")}');
  });

  it("status is a badge with its word; unknown stays the neutral em dash", () => {
    expect(panel).toContain('tone={p.status === "REACHED" ? "brand" : "context"}');
    expect(panel).toMatch(/<ToneBadge tone="neutral"[^>]*>\s*—\s*<\/ToneBadge>/);
  });

  it("computes no progress fraction from value and target", () => {
    expect(panel).not.toMatch(/p\.value\s*\/\s*goal\.target|goal\.target\s*\/\s*p\.value/);
    expect(panel).not.toContain("ProgressBar");
  });
});

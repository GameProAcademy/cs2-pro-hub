/** Link success overlay: wired to both callbacks, translated, self-dismissing, motion-safe. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dictionaries } from "@/i18n/config";

const overlay = readFileSync("src/components/feedback/ConnectionSuccessOverlay.tsx", "utf8");
const css = readFileSync("src/styles.css", "utf8");

describe("ConnectionSuccessOverlay", () => {
  it("is shown only for a successful Steam or FACEIT callback", () => {
    const profile = readFileSync("src/routes/_authenticated/profile.tsx", "utf8");
    expect(profile).toContain('search.connection === "steam_success"');
    expect(profile).toContain('search.connection === "faceit_success"');
    const analysis = readFileSync("src/routes/_authenticated/analysis.tsx", "utf8");
    expect(analysis).toContain(
      'provider={search.connection === "faceit_success" ? "faceit" : null}',
    );
  });

  it("dismisses itself, on click and on Escape, and only celebrates once", () => {
    // The owner asked for 6 seconds on screen.
    expect(overlay).toContain("export const SUCCESS_OVERLAY_MS = 6000;");
    expect(overlay).toContain('e.key === "Escape"');
    expect(overlay).toContain('onClick={() => setPhase("out")}');
    expect(overlay).toContain('url.searchParams.delete("connection")');
    expect(overlay).toContain('role="status"');
  });

  it("has a frosted backdrop and respects reduced motion", () => {
    expect(overlay).toContain("backdrop-blur");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("cs-success-check");
  });

  it("is translated in all five languages", () => {
    for (const [locale, dict] of Object.entries(dictionaries)) {
      const text = (dict as Record<string, string>)["link.success.title"];
      expect(text, locale).toBeTruthy();
    }
  });
});

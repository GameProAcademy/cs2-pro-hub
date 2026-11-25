import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** UX-1.10c: the "who are you in this demo" picker never puts a SteamID in the DOM or on screen. */
describe("demo player picker hides participant keys (SteamIDs)", () => {
  const src = readFileSync("src/components/pipeline/DemoPlayerIdentity.tsx", "utf8");
  it("radio value is the index; label falls back to 'unnamed player N', never the key", () => {
    expect(src).toContain("value={String(index)}");
    expect(src).not.toMatch(/value=\{participant\.participantKey\}/);
    expect(src).not.toMatch(/nickname \?\? (participant|suggestion)\.participantKey/);
  });
  it("the fallback texts exist in the five languages", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"]) {
      const dict = readFileSync(`src/i18n/locales/demoFlow/${l}.ts`, "utf8");
      expect(dict, l).toContain('"pipeline.identify.unnamed"');
      expect(dict, l).toContain('"pipeline.identify.unnamedSuggested"');
    }
  });
});

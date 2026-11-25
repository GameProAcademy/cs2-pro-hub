import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** R-18 / L02 decision (docs/ux1/L02_DECISAO.md): trajectory samples are drawing, never a measure. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "__tests__") return [];
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

const ANALYTICAL = [
  ...files("src/lib/metrics"),
  ...files("src/lib/diagnostics"),
  ...files("src/lib/training"),
  ...files("src/lib/coach"),
  ...files("src/lib/combat"),
  ...files("src/lib/utility"),
  "src/lib/coach.functions.ts",
  "src/lib/xray.functions.ts",
  "src/lib/playerDna.ts",
  "src/lib/playerDnaV3.ts",
  "src/lib/pipeline/metrics.ts",
  "src/lib/pipeline/features.ts",
  "src/lib/trainingPriority.functions.ts",
];

describe("L02: no metric, diagnosis, training or Coach input comes from trajectories", () => {
  it.each(ANALYTICAL)("%s does not read trajectory samples", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/replay\/(trajectory|segment)|round_trajectories|roundTrajectories/);
  });

  it("the four not-evaluated death rules give a reason valid for every match type", () => {
    for (const l of ["pt-BR", "pt-PT", "en", "es", "fr"]) {
      const src = readFileSync(`src/i18n/locales/diagnosis/${l}.ts`, "utf8");
      for (const rule of ["exposure", "isolation", "re_peek", "rotation_timing"]) {
        const i = src.indexOf(`"diagnosis.rule.${rule}.body"`);
        expect(i, `${l} ${rule}`).toBeGreaterThan(-1);
        const text = src.slice(i, src.indexOf('\n  "', i + 10));
        expect(text, `${l} ${rule}`).not.toMatch(
          /não (é|são) guardad|not stored|no se guarda|pas gardée/,
        );
        expect(text, `${l} ${rule}`).toMatch(/Replay/);
      }
    }
  });
});

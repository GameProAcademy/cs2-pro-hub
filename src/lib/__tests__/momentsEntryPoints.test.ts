/**
 * PM5 integration — moments can be saved from the heatmap drill-down, the death review, the duel
 * list, the utility list, the round review and the replay, each with its own source and the
 * event's own match, round and tick (never a typed id).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ENTRY_POINTS: Array<[string, string]> = [
  ["src/components/real/RealHeatmap.tsx", "MAPS"],
  ["src/components/real/RealDeathReview.tsx", "DEATHS"],
  ["src/components/real/RealCombat.tsx", "DUELS"],
  ["src/components/real/RealUtility.tsx", "UTILITY"],
  ["src/components/real/RealRounds.tsx", "ROUNDS"],
  ["src/components/real/RealReplay.tsx", "REPLAY"],
];

describe("moment entry points", () => {
  for (const [file, source] of ENTRY_POINTS)
    it(`${file} saves with source ${source}`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain('from "@/components/moments/SaveMoment"');
      expect(src).toMatch(new RegExp(`<SaveMomentButton[\\s\\S]*?source="${source}"`));
    });
});

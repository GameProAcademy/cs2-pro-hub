/**
 * A Player DNA signal value as a player reads it (shared by the DNA page and the AI
 * Coach, so both show the same thing). The shape follows the formula in
 * `pipeline/features.catalog.ts`, not only the declared unit:
 *  - signals divided by a documented reference (ADR / 100, damage ratio / 2, rating / 1.6,
 *    per-round counts / reference) are an index "N / 100" — never "%", which would read
 *    as a raw share;
 *  - kills per round is the plain number of kills per round;
 *  - every other 0–1 signal is a share of an observed count, shown as a percentage;
 *  - seconds, counts and the availability flag as such.
 * NULL is "—" (not observed), never 0.
 */
const REFERENCE_INDEX = new Set([
  "damage_per_round",
  "damage_efficiency",
  "damage_taken_per_round",
  "utility_damage_per_round",
  "flash_assists_per_round",
  "enemies_flashed_per_round",
  "grenades_per_round",
  "assists_per_round",
  "rating",
]);
const PLAIN_PER_ROUND = new Set(["kills_per_round"]);

export function formatSignalValue(
  name: string,
  value: number | null,
  unit: string,
  yesNo: { yes: string; no: string },
  /** BCP-47 tag for the player's locale; omitted = fixed "." decimals (AI Coach context). */
  intlTag?: string,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const fixed = (v: number, digits: number) =>
    intlTag
      ? new Intl.NumberFormat(intlTag, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(v)
      : v.toFixed(digits);
  if (unit === "seconds") return `${fixed(value, 0)} s`;
  if (unit === "count") return fixed(value, 0);
  if (unit === "flag") return value >= 1 ? yesNo.yes : yesNo.no;
  if (REFERENCE_INDEX.has(name)) return `${fixed(value * 100, 0)} / 100`;
  if (PLAIN_PER_ROUND.has(name)) return fixed(value, 2);
  if (unit === "ratio" || unit === "rate") return `${fixed(value * 100, 1)}%`;
  return fixed(value, 2);
}

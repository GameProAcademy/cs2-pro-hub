/**
 * A Player DNA signal value as a player reads it (shared by the DNA page and the AI
 * Coach, so both show the same thing): shares as percentages, reference-scaled indices
 * on a 0–100 index (never "%", which would read as a raw share), seconds and counts as
 * such, and the availability flag as yes/no. NULL is "—" (not observed), never 0.
 */
export function formatSignalValue(
  value: number | null,
  unit: string,
  yesNo: { yes: string; no: string },
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "ratio") return `${(value * 100).toFixed(1)}%`;
  if (unit === "rate") return `${(value * 100).toFixed(0)} / 100`;
  if (unit === "seconds") return `${value.toFixed(0)} s`;
  if (unit === "count") return value.toFixed(0);
  if (unit === "flag") return value >= 1 ? yesNo.yes : yesNo.no;
  return value.toFixed(2);
}

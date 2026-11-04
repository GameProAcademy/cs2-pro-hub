/**
 * Deterministic decimal rounding for metrics (Fase 2.1).
 *
 * Binary floating point turns decimal means into values such as 0.6549999999999999 (for
 * 0.655), and `Number.prototype.toFixed` / `Intl.NumberFormat` then round the binary value,
 * not the decimal one. This rounds the DECIMAL value instead:
 *  1. strip binary noise by reading the value at 15 significant digits (IEEE-754 doubles
 *     carry 15–17; 15 is the largest count that is always exact);
 *  2. shift the decimal point textually (exponent notation, no multiplication);
 *  3. round half away from zero (0.655 → 0.66, −0.655 → −0.66, 1.005 → 1.01).
 *
 * Rounding happens ONCE, on the final aggregate (contract precision) and again only when
 * formatting for display (display precision). Per-match values are never rounded before
 * they are aggregated beyond what the engine itself persisted.
 */
export function roundHalfUp(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isInteger(digits) || digits < 0 || digits > 10)
    throw new Error(`rounding_digits_out_of_range:${digits}`);
  const clean = Number(value.toPrecision(15));
  if (clean === 0) return 0;
  const sign = clean < 0 ? -1 : 1;
  const [mantissa, exponent] = Math.abs(clean).toExponential().split("e") as [string, string];
  const shifted = Number(`${mantissa}e${Number(exponent) + digits}`);
  const rounded = Number(`${Math.round(shifted)}e${-digits}`);
  return rounded === 0 ? 0 : sign * rounded;
}

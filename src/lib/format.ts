/**
 * Locale-aware display formatting. Unknown is never zero: null/undefined/NaN render as the
 * "not available" marker, and callers announce it to assistive technology.
 */
import { roundHalfUp } from "@/lib/metrics/rounding";

export const NOT_AVAILABLE_MARK = "—";

export function formatNumber(
  value: number | null | undefined,
  intlTag: string,
  digits = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE_MARK;
  // Decimal half-up first (0.655 → 0.66), so Intl never rounds binary noise (0.65499…).
  return new Intl.NumberFormat(intlTag, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(roundHalfUp(value, digits));
}

/** Calendar date of an ISO timestamp, in the reader's locale (UTC date as stored). */
export function formatDate(iso: string | null | undefined, intlTag: string): string {
  if (!iso) return NOT_AVAILABLE_MARK;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE_MARK;
  return new Intl.DateTimeFormat(intlTag, { dateStyle: "short", timeZone: "UTC" }).format(date);
}

/** Date and time of an ISO timestamp, in the reader's locale and time zone. */
export function formatDateTime(iso: string | null | undefined, intlTag: string): string {
  if (!iso) return NOT_AVAILABLE_MARK;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE_MARK;
  return new Intl.DateTimeFormat(intlTag, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function isNotAvailable(value: unknown): boolean {
  return value === null || value === undefined || value === NOT_AVAILABLE_MARK;
}

/** Replaces `{name}` placeholders; unknown placeholders are left as they are. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

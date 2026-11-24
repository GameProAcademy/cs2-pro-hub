/**
 * UX-1.4 / R-10 — one rendering per status of `metric-contract-v1.1` (Doc. 2 §7), the same
 * words on every screen, in the five languages. Only OBSERVED, DERIVED, INFERRED and PARTIAL carry
 * a number; every other status is words, never 0. "Not measured" (the product does not measure
 * it) is distinct from "insufficient sample" and from "not recorded in this demo".
 */
import { useT, type TranslationKey } from "@/i18n";
import { fill } from "@/lib/format";
import type { MetricStatus } from "@/lib/metrics/metricContract";

export interface DataStateInfo {
  status: MetricStatus;
  /** Sample behind the value (n and its unit, already translated). */
  sample?: { n: number; unit: string } | null;
  /** Minimum sample, when the status is INSUFFICIENT_SAMPLE and the minimum is known. */
  minimum?: number | null;
  coverage?: { measured: number; eligible: number } | null;
  /** UNAVAILABLE: why (already translated, e.g. the L04 limitation). */
  reason?: string | null;
}

export function dataStateText(t: (k: TranslationKey) => string, s: DataStateInfo): string {
  switch (s.status) {
    case "PARTIAL":
      return s.coverage ? fill(t("state.PARTIAL.coverage"), s.coverage) : t("state.PARTIAL");
    case "INSUFFICIENT_SAMPLE":
      return s.sample && s.minimum
        ? fill(t("state.INSUFFICIENT_SAMPLE.of"), { ...s.sample, min: s.minimum })
        : s.sample
          ? fill(t("state.INSUFFICIENT_SAMPLE.n"), s.sample)
          : t("state.INSUFFICIENT_SAMPLE");
    case "UNAVAILABLE":
      return s.reason
        ? fill(t("state.UNAVAILABLE.reason"), { reason: s.reason })
        : t("state.UNAVAILABLE");
    default:
      return t(`state.${s.status}` as TranslationKey);
  }
}

export function DataStateText({ className, ...s }: DataStateInfo & { className?: string }) {
  const t = useT();
  return (
    <span data-state={s.status} className={className}>
      {dataStateText(t, s)}
    </span>
  );
}

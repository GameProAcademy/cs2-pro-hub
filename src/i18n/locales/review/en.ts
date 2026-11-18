import type { reviewPtBR } from "./pt-BR";

export const reviewEn: Record<keyof typeof reviewPtBR, string> = {
  "review.title": "Monthly review (preview)",
  "review.subtitle": "Summary of the month from your own data (cs2.monthly-review.v1)",
  "review.noMatches": "No match this month.",
  "review.matches": "{n} matches this month.",
  "review.lowSample":
    "{n} match(es) this month: small sample (fewer than {min}); read the numbers with care.",
  "review.processedDates": "Some dates are processing dates, not match dates.",
  "review.nMatches": "{n} matches",
  "review.vsPrevious": "previous month {v} ({n} matches)",
  "review.comparison.INSUFFICIENT_SAMPLE": "no comparison (not enough sample)",
  "review.comparison.INCOMPATIBLE_METHODS": "no comparison (different methods)",
  "review.comparison.NO_PREVIOUS_MONTH": "no match in the previous month",
  "review.training": "Training: {done} sessions done and {skipped} skipped, of {due} due.",
  "review.noPlan": "No open training plan.",
  "review.moments": "{n} moment(s) saved this month.",
  "review.notSent":
    "Preview on this page only: nothing is sent by e-mail or message. Sending would need your explicit consent, which is not available yet.",
};

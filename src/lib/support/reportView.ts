/** PR4 — what the player is told after a report attempt (pure, shared by UI and tests). */
import type { TranslationKey } from "@/i18n/config";
import type { ProblemReportResult } from "@/lib/pipeline.functions";

export type ReportView =
  | { kind: "idle" }
  | { kind: "form" }
  | { kind: "sent"; protocol: string }
  | { kind: "recorded"; protocol: string }
  | { kind: "error"; key: TranslationKey };

/** Maps a server outcome to what the player is told. Pure, for tests. */
export function reportViewFor(result: ProblemReportResult): ReportView {
  return result.email === "sent"
    ? { kind: "sent", protocol: result.protocol }
    : { kind: "recorded", protocol: result.protocol };
}

export function reportErrorKey(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("REPORT_RATE_LIMITED")) return "report.rateLimited";
  if (message.includes("JOB_NOT_FOUND")) return "report.notFound";
  return "report.unavailable";
}

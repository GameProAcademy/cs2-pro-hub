/**
 * Verification thermometer. Every number here is COMPUTED from real profile
 * rows and real identity evidence — no placeholder and no hardcoded progress.
 */
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { confidenceLabel } from "@/lib/identity/identity.correlation";
import type { VerificationResult } from "@/lib/profile/verification";
import { cn } from "@/lib/utils";

export function VerificationCard({ result }: { result: VerificationResult }) {
  const t = useT();

  return (
    <ChartCard
      title={t("profile.section.verification")}
      subtitle={t("profile.section.verificationDesc")}
      showDemoTag={false}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {t("verification.progress")}
          </span>
          <span className="font-mono text-sm text-foreground">{result.percent}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={result.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("verification.progress")}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              result.percent >= 85
                ? "bg-success"
                : result.percent >= 50
                  ? "bg-primary"
                  : "bg-warning",
            )}
            style={{ width: `${result.percent}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {result.verifiedBadge ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-success">
              <BadgeCheck className="size-3.5" aria-hidden />
              {t("verification.badge")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <ShieldAlert className="size-3.5" aria-hidden />
              {t("verification.notVerified")}
            </span>
          )}
          <span className="rounded-md border border-border bg-card/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("verification.identityStatus")}:{" "}
            {t(`identity.status.${result.identityStatus}` as TranslationKey)}
          </span>
          <span className="rounded-md border border-border bg-card/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("verification.confidenceLabel")}:{" "}
            {t(
              `identity.confidence.${confidenceLabel(result.identityConfidence)}` as TranslationKey,
            )}
          </span>
        </div>

        {result.profile.missing.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("verification.missingTitle")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.profile.missing.map((item) => (
                <span
                  key={item}
                  className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning"
                >
                  {t(`verification.missing.${item}` as TranslationKey)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("verification.recommendations")}
          </p>
          <ul className="space-y-1">
            {result.recommendations.map((rec) => (
              <li key={rec} className="text-xs leading-relaxed text-muted-foreground">
                • {t(`verification.rec.${rec}` as TranslationKey)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartCard>
  );
}

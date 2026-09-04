/**
 * Player identity graph — read-only surface.
 *
 * Renders CORRELATED / STRONGLY_CORRELATED / VERIFIED / CONFLICT with the
 * evidence that produced it, so the state is always explainable. Nickname
 * equality is displayed as weak evidence, never as verification.
 */
import { Fingerprint } from "lucide-react";

import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { confidenceLabel, correlateIdentityGraph, type IdentityObservation } from "@/lib/identity/identity.correlation";
import { EVIDENCE_WEIGHTS } from "@/lib/identity/identity.types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  verified: "border-success/30 bg-success/10 text-success",
  strongly_correlated: "border-primary/30 bg-primary/10 text-primary",
  correlated: "border-warning/30 bg-warning/10 text-warning",
  conflict: "border-destructive/30 bg-destructive/10 text-destructive",
  unlinked: "border-border bg-secondary text-muted-foreground",
};

export function PlayerIdentityPanel({ observations }: { observations: IdentityObservation[] }) {
  const t = useT();
  const graph = correlateIdentityGraph(observations);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <header className="flex items-start gap-2.5">
        <Fingerprint className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("identity.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("identity.subtitle")}</p>
        </div>
      </header>

      <ul className="space-y-2">
        {observations.map((observation) => (
          <li
            key={observation.source}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2"
          >
            <span className="text-sm text-foreground">
              {t(`identity.source.${observation.source}` as TranslationKey)}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {observation.username ?? observation.externalId ?? t("identity.notConnected")}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
            STATUS_CLASS[graph.status] ?? STATUS_CLASS["unlinked"],
          )}
        >
          {t(`identity.status.${graph.status}` as TranslationKey)}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("identity.confidence")}:{" "}
          {t(`identity.confidence.${confidenceLabel(graph.confidence)}` as TranslationKey)}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("identity.evidence")}</p>
        {graph.evidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("identity.noEvidence")}</p>
        ) : (
          <ul className="space-y-1">
            {graph.evidence.map((item, index) => (
              <li
                key={`${item.attribute}-${index}`}
                className="flex items-center justify-between gap-3 font-mono text-[11px] text-muted-foreground"
              >
                <span>
                  {item.identityA.source} ↔ {item.identityB.source} · {item.attribute}
                </span>
                <span>{EVIDENCE_WEIGHTS[item.attribute].strength}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

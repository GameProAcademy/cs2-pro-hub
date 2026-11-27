/**
 * VGL 2.0 continuation — Performance visuals. Decorative identity around real per-match data;
 * nothing here computes or aggregates a metric.
 */
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { MapEmblem } from "@/components/cs2/Cs2Art";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { NOT_AVAILABLE_MARK, formatDate } from "@/lib/format";
import type { OverviewMatch } from "@/lib/playerOverview";
import { cn } from "@/lib/utils";

/**
 * The matches the charts read, oldest first (the charts' own order): emblem, date and known
 * result. Opens each match. Nothing aggregated.
 */
export function MatchRibbon({ matches }: { matches: OverviewMatch[] }) {
  const t = useT();
  const { intlTag } = useI18n();
  const ordered = [...matches].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  return (
    <section aria-label={t("vgl.perf.ribbon")} data-match-ribbon>
      <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {t("vgl.perf.ribbon")}
      </h2>
      <ol className="flex gap-2 overflow-x-auto pb-1" data-table-scroll>
        {ordered.map((m, i) => (
          <li
            key={m.matchId}
            className="vgl-rise shrink-0"
            style={{ "--vgl-i": i } as CSSProperties}
            data-match-ribbon-item={m.result ?? "unknown"}
          >
            <Link
              to="/matches/$matchId"
              params={{ matchId: m.matchId }}
              className={cn(
                "vgl-lift flex min-h-11 items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                m.result === "win"
                  ? "border-primary/40"
                  : m.result === "loss"
                    ? "border-destructive/40"
                    : "border-border",
              )}
            >
              <MapEmblem map={m.map} className="size-7" />
              <span className="text-xs">
                <span className="block font-mono tabular-nums text-foreground">
                  {formatDate(m.playedAt, intlTag)}
                </span>
                <span className="block text-muted-foreground">
                  {m.result
                    ? t(`matches.result.${m.result}` as TranslationKey)
                    : NOT_AVAILABLE_MARK}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

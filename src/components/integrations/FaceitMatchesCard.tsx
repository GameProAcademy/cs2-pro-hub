/**
 * VGL 5.0 — Frente 8: native FACEIT matches, labelled as FACEIT data and kept apart from the
 * demo-based numbers (Score, DNA and aggregates come from parsed demos only).
 */
import { useQuery } from "@tanstack/react-query";

import { ChartCard } from "@/components/common/ChartCard";
import { useI18n, type TranslationKey } from "@/i18n";
import { getFaceitConnection, type FaceitConnectionView } from "@/lib/faceit.functions";
import { getFaceitMatches } from "@/lib/faceitMatches.functions";
import { mapDisplayName } from "@/lib/cs2/maps";
import { fill, formatDate, formatNumber, NOT_AVAILABLE_MARK } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FaceitMatchesCard() {
  const { t, intlTag } = useI18n();
  const connection = useQuery<FaceitConnectionView>({
    queryKey: ["faceit", "connection"],
    queryFn: () => getFaceitConnection(),
  });
  const connected = connection.data?.connected === true;
  const q = useQuery({
    queryKey: ["faceit", "matches"],
    queryFn: () => getFaceitMatches(),
    enabled: connected,
  });
  if (!connected) return null;
  const v = q.data;
  return (
    <ChartCard
      title={t("vgl5.faceit.title")}
      subtitle={t("vgl5.faceit.description")}
      showDemoTag={false}
    >
      <div data-faceit-matches data-source="faceit">
        {q.isPending ? (
          <p className="text-sm text-muted-foreground">{t("vgl5.faceit.loading")}</p>
        ) : q.isError ? (
          <p className="text-sm text-destructive">{t("vgl5.faceit.error")}</p>
        ) : !v || v.matches.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-faceit-matches-empty>
            {t("vgl5.faceit.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {v.matches.map((m, i) => (
              <li
                key={m.externalMatchId ?? i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  FACEIT
                </span>
                <span className="min-w-24 font-medium">{mapDisplayName(m.map)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(m.playedAt, intlTag)}
                </span>
                {m.result ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-semibold",
                      m.result === "win"
                        ? "bg-success/15 text-success"
                        : m.result === "loss"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`vgl5.pub.result.${m.result}` as TranslationKey)}
                  </span>
                ) : null}
                {m.scorePlayer !== null && m.scoreOpponent !== null ? (
                  <span className="font-mono text-xs tabular-nums">
                    {m.scorePlayer}–{m.scoreOpponent}
                  </span>
                ) : null}
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {m.kills ?? NOT_AVAILABLE_MARK}/{m.deaths ?? NOT_AVAILABLE_MARK} · ADR{" "}
                  {formatNumber(m.adr, intlTag, 0)}
                </span>
                {!m.complete ? (
                  <span className="w-full text-xs text-muted-foreground">
                    {t("vgl5.faceit.partial")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {v && (v.total > v.matches.length || v.linkedToDemo > 0) ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {v.total > v.matches.length
              ? fill(t("vgl5.faceit.more"), { shown: v.matches.length, total: v.total })
              : null}
            {v.linkedToDemo > 0 ? ` ${fill(t("vgl5.faceit.linked"), { n: v.linkedToDemo })}` : null}
          </p>
        ) : null}
      </div>
    </ChartCard>
  );
}

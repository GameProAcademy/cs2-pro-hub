/**
 * VGL 3.0 — Competitive HUD family. `SegmentedCount` draws "done of due" as one segment per unit,
 * the same two integers the text states (no rate, no rounding). Above `max` units it draws nothing,
 * so a long plan never becomes an unreadable bar.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { MapEmblem } from "@/components/cs2/Cs2Art";
import { useI18n, useT } from "@/i18n";
import { getAdaptiveTraining } from "@/lib/adaptiveTraining.functions";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, formatDate, formatNumber } from "@/lib/format";
import type { OverviewMatch } from "@/lib/playerOverview";

import { cn } from "@/lib/utils";

export function SegmentedCount({
  done,
  due,
  max = 30,
  className,
}: {
  done: number;
  due: number;
  max?: number;
  className?: string;
}) {
  if (!Number.isInteger(done) || !Number.isInteger(due) || due <= 0 || due > max || done < 0)
    return null;
  const filled = Math.min(done, due);
  return (
    <span
      aria-hidden
      className={cn("flex w-full max-w-md gap-1", className)}
      data-segmented-count={`${filled}/${due}`}
    >
      {Array.from({ length: due }, (_, i) => (
        <span
          key={i}
          className={cn(
            "vgl-rise h-2 flex-1 rounded-sm",
            i < filled ? "bg-primary" : "border border-border-strong bg-background/40",
          )}
          style={{ "--vgl-i": i } as CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * VGL 4.0 — the match with the highest and the one with the lowest rating, each the match's own
 * value. A tie for the top (or the bottom) shows no match on that side, and fewer than two rated
 * matches show nothing: no "best" is invented.
 */
export function ratingExtremes(matches: ReadonlyArray<OverviewMatch>) {
  const rated = matches.filter((m) => m.rating !== null);
  if (rated.length < 2) return null;
  const max = Math.max(...rated.map((m) => m.rating!));
  const min = Math.min(...rated.map((m) => m.rating!));
  if (max === min) return null;
  const top = rated.filter((m) => m.rating === max);
  const low = rated.filter((m) => m.rating === min);
  return { high: top.length === 1 ? top[0]! : null, low: low.length === 1 ? low[0]! : null };
}

export function HighlightPair({ matches }: { matches: ReadonlyArray<OverviewMatch> }) {
  const t = useT();
  const { intlTag } = useI18n();
  const ex = ratingExtremes(matches);
  if (!ex || (!ex.high && !ex.low)) return null;
  const card = (m: OverviewMatch | null, kind: "high" | "low") =>
    m ? (
      <Link
        to="/matches/$matchId"
        params={{ matchId: m.matchId }}
        className={
          "vgl-lift flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          (kind === "high" ? "border-primary/40" : "border-warning/40")
        }
      >
        <MapEmblem map={m.map} className="size-10" />
        <span className="min-w-0 flex-1">
          <span
            className={
              "block font-mono text-xs uppercase tracking-[0.16em] " +
              (kind === "high" ? "text-primary" : "text-warning")
            }
          >
            {t(kind === "high" ? "vgl4.perf.high" : "vgl4.perf.low")}
          </span>
          <span className="block truncate text-sm text-foreground">
            {m.map ? mapDisplayName(m.map) : NOT_AVAILABLE_MARK} ·{" "}
            <span className="font-mono text-muted-foreground">
              {formatDate(m.playedAt, intlTag)}
            </span>
          </span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-2xl font-semibold tabular-nums text-foreground">
            {formatNumber(m.rating!, intlTag, 2)}
          </span>
          <span className="block font-mono text-xs text-muted-foreground">
            {m.kills === null || m.deaths === null
              ? NOT_AVAILABLE_MARK
              : `${m.kills} / ${m.deaths}`}
          </span>
        </span>
      </Link>
    ) : null;
  return (
    <section aria-labelledby="perf-highlights-title" data-perf-highlights>
      <h2
        id="perf-highlights-title"
        className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
      >
        <GameIcon name="trend" className="size-3.5 text-primary" />
        {t("vgl4.perf.title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {card(ex.high, "high")}
        {card(ex.low, "low")}
      </div>
    </section>
  );
}

/**
 * VGL 4.0 — the home's command row: three entry points with their real state (the training plan's
 * own adherence, the last match's map for the Coach, the number of maps played).
 */
export function HomeCommandRow({ matches }: { matches: ReadonlyArray<OverviewMatch> }) {
  const t = useT();
  const aq = useQuery({
    queryKey: ["player", "training", "adaptive"],
    queryFn: () => getAdaptiveTraining(),
  });
  const plan = aq.data?.plan ?? null;
  const last = [...matches].sort((a, b) => b.playedAt.localeCompare(a.playedAt))[0];
  const maps = new Set(matches.map((m) => m.map).filter(Boolean)).size;
  const items = [
    {
      to: "/training" as const,
      icon: "target" as const,
      title: t("vgl4.home.training"),
      state: plan
        ? `${t(`training.adaptive.status.${plan.status}` as Parameters<typeof t>[0])} · ${plan.adherence.done} / ${plan.adherence.due}`
        : t("vgl4.home.trainingNone"),
    },
    {
      to: "/coach" as const,
      icon: "dna" as const,
      title: t("vgl4.home.coach"),
      state: last?.map
        ? `${t("vgl4.home.coachLast")} ${mapDisplayName(last.map)}`
        : t("vgl4.home.coachAsk"),
    },
    {
      to: "/maps" as const,
      icon: "map" as const,
      title: t("vgl4.home.maps"),
      state: `${maps} ${t("vgl4.home.mapsUnit")}`,
    },
  ];
  return (
    <nav aria-label={t("vgl4.home.label")} data-home-commands>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <li
            key={it.to}
            className="vgl-rise"
            style={{ "--vgl-i": i } as CSSProperties}
            data-home-command={it.to}
          >
            <Link
              to={it.to}
              className="vgl-lift surface-panel flex min-h-11 items-center gap-3 rounded-xl border border-border p-4 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <GameIcon name={it.icon} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                  {it.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{it.state}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

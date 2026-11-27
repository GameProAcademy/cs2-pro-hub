/**
 * VGL 3.0 — Player Identity family. `SpecialtyStrip` shows the strongest and weakest measured
 * dimensions of the latest persisted Player DNA snapshot (same method, READY state), with the same
 * ranking rule as the DNA page's technical signature. It reads the history the DNA page already
 * reads; it never computes the DNA. No snapshot → nothing is shown.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { DNA_ICON, comparableSnapshots, signature } from "@/components/cs2/DnaVisuals";
import { useI18n } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { formatDate, fill } from "@/lib/format";
import { DNA_VERSION_V3 } from "@/lib/playerDnaV3";
import type { DnaDimension } from "@/types";
import { cn } from "@/lib/utils";
import { getDnaHistory, type DnaHistoryEntry } from "@/lib/xray.functions";

/** The latest comparable snapshot as signature input (indexes 0–1), or null. Pure. */
export function latestSpecialties(entries: ReadonlyArray<DnaHistoryEntry>, version: string) {
  const snaps = comparableSnapshots(entries, version);
  const last = snaps[snaps.length - 1];
  if (!last) return null;
  const dims = (Object.keys(DNA_ICON) as DnaDimension[]).map((dimension) => {
    const v = last.dimensions[dimension];
    return { dimension, value: typeof v === "number" ? v / 100 : null };
  });
  const s = signature(dims);
  if (!s.measured.length) return null;
  return { at: last.createdAt, matches: last.matchCount, top: s.top, low: s.low };
}

function Chip({
  dimension,
  value,
  tone,
  i,
}: {
  dimension: DnaDimension;
  value: number;
  tone: "top" | "low";
  i: number;
}) {
  const { t } = useI18n();
  const icon = (DNA_ICON as Record<string, Parameters<typeof GameIcon>[0]["name"]>)[dimension];
  return (
    <li
      className={cn(
        "vgl-rise flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2",
        tone === "top" ? "border-primary/35 bg-primary/8" : "border-warning/30 bg-warning/8",
      )}
      style={{ "--vgl-i": i } as CSSProperties}
      data-specialty={dimension}
      data-specialty-tone={tone}
    >
      <GameIcon
        name={icon ?? "dna"}
        className={cn("size-4 shrink-0", tone === "top" ? "text-primary" : "text-warning")}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {t(dnaLabelKey(dimension))}
      </span>
      <span className="font-mono text-base font-semibold tabular-nums text-foreground">
        {Math.round(value * 100)}
      </span>
    </li>
  );
}

export function SpecialtyStrip({ className }: { className?: string }) {
  const { t, intlTag } = useI18n();
  const q = useQuery({ queryKey: ["player", "dna", "history"], queryFn: () => getDnaHistory() });
  const s = q.data ? latestSpecialties(q.data, DNA_VERSION_V3) : null;
  if (!s) return null;
  return (
    <section
      className={cn(
        "surface-panel vgl-grid relative overflow-hidden rounded-xl border border-border p-4 sm:p-5",
        className,
      )}
      aria-labelledby="specialty-title"
      data-specialty-strip
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="specialty-title"
          className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
        >
          <GameIcon name="dna" className="size-4 text-primary" />
          {t("vgl3.specialty.title")}
        </h2>
        <Link
          to="/player-dna"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("real.dna.open")}
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {fill(t("vgl3.specialty.source"), {
          date: formatDate(s.at, intlTag),
          matches: s.matches ?? "—",
        })}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {t("vgl.dna.signature.top")}
          </h3>
          <ol className="grid gap-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            {s.top.map((d, i) => (
              <Chip key={d.dimension} dimension={d.dimension} value={d.value} tone="top" i={i} />
            ))}
          </ol>
        </div>
        {s.low.length ? (
          <div>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-warning">
              {t("vgl.dna.signature.low")}
            </h3>
            <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {s.low.map((d, i) => (
                <Chip
                  key={d.dimension}
                  dimension={d.dimension}
                  value={d.value}
                  tone="low"
                  i={i + 3}
                />
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

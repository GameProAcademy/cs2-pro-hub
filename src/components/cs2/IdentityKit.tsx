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
import { Cs2Mask } from "@/components/cs2/Cs2Art";
import { DIMENSION_ART } from "@/lib/cs2/assets";
import {
  DNA_ICON,
  comparableSnapshots,
  signature,
  type SignatureDim,
} from "@/components/cs2/DnaVisuals";
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
  return {
    at: last.createdAt,
    matches: last.matchCount,
    top: s.top,
    low: s.low,
    measured: s.measured.length,
  };
}

function Chip({
  dimension,
  value,
  tone,
  i,
  rank,
}: {
  dimension: DnaDimension;
  value: number;
  tone: "top" | "low";
  i: number;
  /** VGL 4.0: position among the measured dimensions (1 = highest). */
  rank?: number;
}) {
  const { t } = useI18n();
  const icon = (DNA_ICON as Record<string, Parameters<typeof GameIcon>[0]["name"]>)[dimension];
  const art = DIMENSION_ART[dimension];
  return (
    <li
      className={cn(
        "vgl-rise vgl-lift relative isolate flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-3 py-2",
        tone === "top" ? "border-primary/35 bg-primary/8" : "border-warning/30 bg-warning/8",
      )}
      style={{ "--vgl-i": i } as CSSProperties}
      title={fill(t("vgl4.specialty.tip"), {
        dimension: t(dnaLabelKey(dimension)),
        value: Math.round(value * 100),
      })}
      data-specialty={dimension}
      data-specialty-tone={tone}
      data-specialty-rank={rank ?? ""}
    >
      {art ? (
        <Cs2Mask
          src={art}
          className={cn(
            "pointer-events-none absolute -right-2 top-1/2 -z-10 h-8 w-20 -translate-y-1/2 opacity-[0.12]",
            tone === "top" ? "text-primary" : "text-warning",
          )}
        />
      ) : null}
      {rank ? (
        <span className="font-mono text-xs text-muted-foreground" aria-hidden>
          #{rank}
        </span>
      ) : null}
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
              <Chip
                key={d.dimension}
                dimension={d.dimension}
                value={d.value}
                tone="top"
                i={i}
                rank={i + 1}
              />
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
                  rank={s.measured - i}
                />
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Position of each measured dimension (1 = highest) and its signature role. Pure. */
export function dimensionRanks(dims: ReadonlyArray<SignatureDim>) {
  const s = signature(dims);
  const top = new Set(s.top.map((d) => d.dimension));
  const low = new Set(s.low.map((d) => d.dimension));
  const out = new Map<string, { rank: number; of: number; role: "top" | "low" | null }>();
  s.measured.forEach((d, i) =>
    out.set(d.dimension, {
      rank: i + 1,
      of: s.measured.length,
      role: top.has(d.dimension) ? "top" : low.has(d.dimension) ? "low" : null,
    }),
  );
  return out;
}

/** "#2 of 8" and, when it applies, "specialty" or "to develop" (same rule as the signature). */
export function DimensionRank({
  rank,
}: {
  rank: { rank: number; of: number; role: "top" | "low" | null } | undefined;
}) {
  const { t } = useI18n();
  if (!rank) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-dimension-rank={rank.rank}>
      <span className="rounded border border-border-strong px-1.5 font-mono text-xs text-foreground">
        {fill(t("vgl4.identity.rank"), { n: rank.rank, of: rank.of })}
      </span>
      {rank.role ? (
        <span
          className={cn(
            "rounded px-1.5 text-xs font-medium",
            rank.role === "top" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning",
          )}
          data-dimension-role={rank.role}
        >
          {t(rank.role === "top" ? "vgl4.identity.specialty" : "vgl4.identity.develop")}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Top of the Player DNA: the highest measured dimension as the card's art, the signature's
 * three highest indexes as ranked bars, and how many dimensions have an index. Same numbers as the
 * radar (index × 100, rounded); nothing is labelled beyond the dimensions themselves.
 */
export function IdentityCard({
  dims,
  matches,
  rounds,
}: {
  dims: ReadonlyArray<SignatureDim>;
  matches: number;
  rounds: number | null;
}) {
  const { t } = useI18n();
  const s = signature(dims);
  const lead = s.top[0];
  if (!lead) return null;
  const art = DIMENSION_ART[lead.dimension];
  const icon = (DNA_ICON as Record<string, Parameters<typeof GameIcon>[0]["name"]>)[lead.dimension];
  return (
    <section
      className="surface-panel vgl-grid relative isolate overflow-hidden rounded-2xl border border-primary/30 p-5 sm:p-7"
      aria-labelledby="identity-card-title"
      data-identity-card={lead.dimension}
    >
      {art ? (
        <Cs2Mask
          src={art}
          className="vgl-art pointer-events-none absolute -right-6 top-1/2 -z-10 h-40 w-[26rem] -translate-y-1/2 text-primary opacity-[0.1] sm:h-56 sm:w-[34rem]"
        />
      ) : null}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
        {t("vgl4.identity.eyebrow")}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
        <h2
          id="identity-card-title"
          className="flex items-center gap-3 font-display text-3xl font-semibold uppercase tracking-wide text-foreground sm:text-4xl"
        >
          <GameIcon name={icon ?? "dna"} className="size-7 text-primary" />
          {t(dnaLabelKey(lead.dimension))}
        </h2>
        <span className="font-mono text-4xl font-semibold tabular-nums text-primary sm:text-5xl">
          {Math.round(lead.value * 100)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("vgl4.identity.lead")}</p>
      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ol className="space-y-2.5" data-identity-top>
          {s.top.map((d, i) => (
            <li
              key={d.dimension}
              className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] items-center gap-3"
            >
              <span className="font-mono text-sm text-muted-foreground">#{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {t(dnaLabelKey(d.dimension))}
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="vgl-grow block h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(d.value * 100)}%` }}
                  />
                </span>
              </span>
              <span className="text-right font-mono text-lg font-semibold tabular-nums text-foreground">
                {Math.round(d.value * 100)}
              </span>
            </li>
          ))}
        </ol>
        <dl className="grid grid-cols-2 gap-3 self-start" data-identity-counts>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <dt className="text-xs text-muted-foreground">{t("vgl4.identity.measured")}</dt>
            <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
              {s.measured.length} / {dims.length}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <dt className="text-xs text-muted-foreground">{t("vgl4.identity.base")}</dt>
            <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
              {matches}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {fill(t("vgl4.identity.baseUnit"), { rounds: rounds ?? "—" })}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

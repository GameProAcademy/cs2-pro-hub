/**
 * VGL 2.0 continuation — Player DNA as a technical signature.
 *
 * Presentation of values the page already has:
 *  - DnaSignature: the READY profile's own indexes, sorted, as a comparison between dimensions
 *    (highest / lowest measured), with the dimension's CS2 silhouette. Sorting is the only
 *    operation; no new index, no percentile, nothing against other players.
 *  - DnaTrend: each dimension across saved snapshots of the SAME method with a complete profile
 *    (the comparability rule). Points are the persisted values; nothing is interpolated, and fewer
 *    than two comparable snapshots draws no trend.
 */
import type { CSSProperties } from "react";

import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { Cs2Mask } from "@/components/cs2/Cs2Art";
import { useI18n } from "@/i18n";
import { DIMENSION_ART } from "@/lib/cs2/assets";
import { dnaLabelKey } from "@/lib/dna";
import type { DnaDimension } from "@/types";
import type { DnaHistoryEntry } from "@/lib/xray.functions";
import { fill } from "@/lib/format";
import { cn } from "@/lib/utils";

export const DNA_ICON = {
  aim: "crosshair",
  dueling: "kill",
  survivability: "shield",
  positioning: "map",
  utility: "grenade",
  decision_making: "dna",
  teamplay: "assist",
  economy: "rounds",
  clutch: "clutch",
  consistency: "trend",
} as const satisfies Record<string, GameIconName>;

const icon = (d: string): GameIconName => (DNA_ICON as Record<string, GameIconName>)[d] ?? "dna";

export interface SignatureDim {
  dimension: DnaDimension;
  value: number | null;
}

/** Sorted measured dimensions (desc) and the ones without an index. Pure; used by the tests. */
export function signature(dims: ReadonlyArray<SignatureDim>) {
  const measured = dims
    .filter((d): d is SignatureDim & { value: number } => d.value !== null)
    .sort((a, b) => b.value - a.value || a.dimension.localeCompare(b.dimension));
  const missing = dims.filter((d) => d.value === null).map((d) => d.dimension);
  return {
    measured,
    top: measured.slice(0, 3),
    low: measured.length > 3 ? measured.slice(-2).reverse() : [],
    missing,
  };
}

function DimChip({
  d,
  tone,
  i,
}: {
  d: SignatureDim & { value: number };
  tone: "top" | "low";
  i: number;
}) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "vgl-rise relative isolate flex items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5",
        tone === "top" ? "border-primary/35 bg-primary/8" : "border-warning/30 bg-warning/8",
      )}
      style={{ "--vgl-i": i } as CSSProperties}
      data-signature-dim={d.dimension}
    >
      <Cs2Mask
        src={DIMENSION_ART[d.dimension] ?? DIMENSION_ART["aim"]!}
        className={cn(
          "pointer-events-none absolute -right-2 top-1/2 -z-10 h-10 w-28 -translate-y-1/2 opacity-[0.12]",
          tone === "top" ? "text-primary" : "text-warning",
        )}
      />
      <GameIcon
        name={icon(d.dimension)}
        className={cn("size-5", tone === "top" ? "text-primary" : "text-warning")}
      />
      <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold uppercase tracking-wide text-foreground">
        {t(dnaLabelKey(d.dimension))}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
        {Math.round(d.value * 100)}
      </span>
    </li>
  );
}

/** READY only: the profile's indexes compared with each other. */
export function DnaSignature({ dims }: { dims: ReadonlyArray<SignatureDim> }) {
  const { t } = useI18n();
  const s = signature(dims);
  if (!s.measured.length) return null;
  return (
    <section
      className="surface-panel vgl-grid relative overflow-hidden rounded-xl border border-border p-4 sm:p-6"
      aria-labelledby="dna-signature-title"
      data-dna-signature
    >
      <h2
        id="dna-signature-title"
        className="font-display text-lg font-semibold uppercase tracking-wide text-foreground"
      >
        {t("vgl.dna.signature.title")}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        {t("vgl.dna.signature.subtitle")}
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {t("vgl.dna.signature.top")}
            </h3>
            <ol className="space-y-2">
              {s.top.map((d, i) => (
                <DimChip key={d.dimension} d={d} tone="top" i={i} />
              ))}
            </ol>
          </div>
          {s.low.length ? (
            <div>
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-warning">
                {t("vgl.dna.signature.low")}
              </h3>
              <ol className="space-y-2">
                {s.low.map((d, i) => (
                  <DimChip key={d.dimension} d={d} tone="low" i={i + 3} />
                ))}
              </ol>
            </div>
          ) : null}
        </div>
        <div>
          <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("vgl.dna.signature.compare")}
          </h3>
          <ul className="space-y-2.5" data-dna-compare>
            {s.measured.map((d, i) => (
              <li
                key={d.dimension}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <GameIcon name={icon(d.dimension)} className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{t(dnaLabelKey(d.dimension))}</span>
                </span>
                <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="vgl-grow block h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.round(d.value * 100)}%`,
                      animationDelay: `${i * 50}ms`,
                    }}
                  />
                </span>
                <span className="text-right font-mono tabular-nums text-foreground">
                  {Math.round(d.value * 100)}
                </span>
              </li>
            ))}
            {s.missing.map((dim) => (
              <li
                key={dim}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm text-muted-foreground"
                data-dna-compare-missing={dim}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <GameIcon name={icon(dim)} className="size-4 shrink-0" />
                  <span className="truncate">{t(dnaLabelKey(dim))}</span>
                </span>
                <span
                  aria-hidden
                  className="h-2.5 rounded-full border border-dashed border-border-strong"
                />
                <span className="text-right font-mono">—</span>
              </li>
            ))}
          </ul>
          {s.missing.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("vgl.dna.signature.notMeasured")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Comparable snapshots (same method, complete profile), oldest first. Pure; used by the tests. */
export function comparableSnapshots(entries: ReadonlyArray<DnaHistoryEntry>, version: string) {
  return entries
    .filter((h) => h.dnaVersion === version && h.state === "READY")
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function Spark({ values }: { values: Array<number | null> }) {
  const w = 120;
  const h = 32;
  const n = values.length;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 8) + 4);
  const y = (v: number) => h - 4 - (v / 100) * (h - 8);
  // Segments only between two consecutive recorded points: a gap stays a gap.
  const segs: string[] = [];
  values.forEach((v, i) => {
    const prev = values[i - 1];
    if (i > 0 && v !== null && prev !== null && prev !== undefined)
      segs.push(`M${x(i - 1)},${y(prev)}L${x(i)},${y(v)}`);
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" aria-hidden>
      <path
        d={segs.join("")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {values.map((v, i) =>
        v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--primary)" />,
      )}
    </svg>
  );
}

export function DnaTrend({
  entries,
  version,
}: {
  entries: ReadonlyArray<DnaHistoryEntry>;
  version: string;
}) {
  const { t } = useI18n();
  const snaps = comparableSnapshots(entries, version);
  const dims = Object.keys(DNA_ICON) as DnaDimension[];
  return (
    <section className="mt-6 space-y-3" data-dna-trend>
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
        {t("vgl.dna.trend.title")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {fill(t("vgl.dna.trend.subtitle"), { version })}
      </p>
      {snaps.length < 2 ? (
        <p
          className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground"
          data-dna-trend-empty
        >
          {fill(t("vgl.dna.trend.needTwo"), { n: snaps.length })}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {dims.map((dim) => {
            const values = snaps.map((s) => {
              const v = (s.dimensions as Record<string, number | null | undefined>)[dim];
              return typeof v === "number" ? v : null;
            });
            const known = values.filter((v): v is number => v !== null);
            return (
              <li
                key={dim}
                className="rounded-lg border border-border bg-background/40 px-3 py-2.5"
                data-dna-trend-dim={dim}
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GameIcon name={icon(dim)} className="size-3.5 text-primary" />
                  <span className="truncate">{t(dnaLabelKey(dim))}</span>
                </p>
                {known.length ? <Spark values={values} /> : <div className="h-8" />}
                <p className="font-mono text-xs tabular-nums text-foreground">
                  {known.length
                    ? `${Math.round(known[0]!)} → ${Math.round(known[known.length - 1]!)}`
                    : "—"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

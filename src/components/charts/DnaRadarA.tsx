/**
 * UX-1.6 / R-14 — Player DNA radar, alternative A (Doc. 5, round-2 composition; Doc. 2 §14).
 *
 * - Every dimension is always an axis (fixed, documented order: the catalogue order), so the
 *   area never changes because a dimension went missing.
 * - An axis with a value has a vertex; an axis without one (no sample / not measured) is dashed,
 *   has no vertex, and the lime fill only covers the sectors between two axes with a value.
 * - Grid at 25 / 50 / 75 / 100, one polygon (the player), no colour of good or bad.
 * - Selecting an axis (pointer, keyboard) is the same selection as the dimension chips.
 *
 * Pure SVG (no chart library): the geometry is explicit and testable.
 */
import { useId } from "react";
import { useI18n } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { splitAxisLabel } from "@/lib/dnaAxisLabel";
import { cn } from "@/lib/utils";
import type { DnaDimension } from "@/types";

export interface RadarAxis {
  dimension: DnaDimension;
  /** 0–100 index, or null (no sample / not measured / in formation). */
  value: number | null;
  status: "MEASURED" | "NO_SAMPLE" | "NOT_MEASURED";
}

// Labels sit at R + 26 with up to ~12 characters on a line: 520 keeps them inside the box.
const SIZE = 520;
const C = SIZE / 2;
const R = 140;
const GRID = [25, 50, 75, 100];

export function axisPoint(i: number, n: number, radius: number): [number, number] {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

/** Sectors filled: consecutive axes that both carry a value (indices i, i+1 mod n). */
export function filledSectors(axes: Pick<RadarAxis, "value">[]): Array<[number, number]> {
  const n = axes.length;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (axes[i]!.value !== null && axes[j]!.value !== null) out.push([i, j]);
  }
  return out;
}

export function DnaRadarA({
  axes,
  selected,
  onSelect,
}: {
  axes: RadarAxis[];
  selected: DnaDimension | null;
  onSelect: (d: DnaDimension) => void;
}) {
  const { t } = useI18n();
  const n = axes.length;
  const pt = (i: number) => axisPoint(i, n, (R * (axes[i]!.value ?? 0)) / 100);
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto block h-auto w-full max-w-[560px]"
      role="group"
      aria-label={t("real.dna.select")}
      data-dna-radar-a
    >
      {/* V-4: depth for the protagonist radar; a soft lime glow under the filled sectors. */}
      <defs>
        <radialGradient id={`${uid}-bg`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.08} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx={C} cy={C} r={R} fill={`url(#${uid}-bg)`} />
      {GRID.map((g) => (
        <polygon
          key={g}
          points={axes.map((_, i) => axisPoint(i, n, (R * g) / 100).join(",")).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth={g === 100 ? 1.2 : 0.8}
        />
      ))}
      <g filter={`url(#${uid}-glow)`} data-radar-fill>
        {filledSectors(axes).map(([i, j]) => {
          const [x1, y1] = pt(i);
          const [x2, y2] = pt(j);
          return (
            <g key={`s${i}`} data-sector={`${i}-${j}`}>
              <polygon
                points={`${C},${C} ${x1},${y1} ${x2},${y2}`}
                fill="var(--chart-1)"
                fillOpacity={0.28}
                stroke="none"
              />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--chart-1)" strokeWidth={2} />
            </g>
          );
        })}
      </g>
      {axes.map((a, i) => {
        const [ex, ey] = axisPoint(i, n, R);
        const empty = a.value === null;
        const isSel = selected === a.dimension;
        const [lx, ly] = axisPoint(i, n, R + 26);
        const label = t(dnaLabelKey(a.dimension));
        const lines = splitAxisLabel(label);
        const anchor = Math.abs(lx - C) < 8 ? "middle" : lx > C ? "start" : "end";
        const statusText = empty
          ? t(`real.dna.status.${a.status === "MEASURED" ? "NO_SAMPLE" : a.status}`)
          : null;
        return (
          <g
            key={a.dimension}
            data-axis={a.dimension}
            data-axis-empty={empty ? a.status : undefined}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            aria-label={`${label}: ${empty ? statusText : `${a.value} / 100`}`}
            onClick={() => onSelect(a.dimension)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(a.dimension);
              }
            }}
            className="cursor-pointer outline-none [&:focus-visible>text]:underline"
          >
            <line
              x1={C}
              y1={C}
              x2={ex}
              y2={ey}
              stroke={isSel ? "var(--chart-1)" : "var(--border)"}
              strokeWidth={isSel ? 1.6 : 1}
              strokeDasharray={empty ? "4 4" : undefined}
            />
            {empty ? null : (
              <circle
                cx={pt(i)[0]}
                cy={pt(i)[1]}
                r={isSel ? 5 : 3.5}
                fill="var(--chart-1)"
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            )}
            {/* Generous hit area around the label (≥ 44 px on a 375 px screen). */}
            <circle cx={lx} cy={ly} r={30} fill="transparent" />
            <text
              x={lx}
              y={ly - (lines.length - 1) * 7 - 4}
              textAnchor={anchor}
              fontSize={14}
              fill={isSel ? "var(--foreground)" : "var(--muted-foreground)"}
              fontWeight={isSel ? 600 : 400}
            >
              {lines.map((line, k) => (
                <tspan key={k} x={lx} dy={k === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
              <tspan x={lx} dy={15} fontSize={13} className={cn(empty && "italic")}>
                {empty ? statusText : String(a.value)}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

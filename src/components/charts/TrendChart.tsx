import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TimeSeriesPoint } from "@/types";

export interface SeriesConfig {
  key: string;
  label: string;
  color?: string | undefined;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)", fontSize: 11 },
} as const;

/**
 * Reusable time-series chart. Data-source agnostic: pass any array of
 * `{ label, ...series }` points — mock now, database rows later.
 */
export function TrendChart({
  data,
  series,
  variant = "area",
  height = 240,
  domain,
  unit,
}: {
  data: TimeSeriesPoint[];
  series: SeriesConfig[];
  variant?: "area" | "line" | undefined;
  height?: number | undefined;
  domain?: [number | "auto", number | "auto"] | undefined;
  unit?: string | undefined;
}) {
  const showLegend = series.length > 1;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {variant === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={s.color ?? PALETTE[i % PALETTE.length]}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={s.color ?? PALETTE[i % PALETTE.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              domain={domain ?? ["auto", "auto"]}
              {...(unit ? { unit } : {})}
              width={44}
            />
            <Tooltip {...tooltipStyle} />
            {showLegend ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                fill={`url(#grad-${s.key})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis
              {...axisProps}
              domain={domain ?? ["auto", "auto"]}
              {...(unit ? { unit } : {})}
              width={44}
            />
            <Tooltip {...tooltipStyle} />
            {showLegend ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

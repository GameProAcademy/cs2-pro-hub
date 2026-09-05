import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useT } from "@/i18n";
import {
  getMapPerformanceDisplayContexts,
  type MapPerformanceDisplayContext,
} from "@/lib/cs2/mapPerformance";
import type { MapPerformance } from "@/types";

/**
 * Win rate per map.
 *
 * All pool reasoning comes from `getMapPerformanceDisplayContexts` — this
 * component never resolves dates or pool versions itself. Rows without real data
 * are excluded from the bars instead of being drawn as 0%.
 */
export function MapPerformanceChart({
  data,
  height = 280,
  now,
}: {
  data: MapPerformance[];
  height?: number | undefined;
  now?: Date | string | undefined;
}) {
  const t = useT();

  const contexts = useMemo(
    () => getMapPerformanceDisplayContexts(data, now ?? new Date()),
    [data, now],
  );
  const plotted = contexts.filter((entry) => entry.hasData);
  const hasHistorical = plotted.some((entry) => entry.isHistorical);

  if (plotted.length === 0) {
    return (
      <div style={{ height }} className="flex w-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("maps.noData")}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={plotted} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="displayLabel"
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              unit="%"
              width={48}
            />
            <Tooltip
              cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              formatter={(value: number) => [`${value}%`, t("performance.winRate")]}
            />
            <Bar dataKey="winRate" radius={[3, 3, 0, 0]} maxBarSize={44}>
              {plotted.map((entry: MapPerformanceDisplayContext) => (
                <Cell
                  key={entry.displayLabel}
                  fillOpacity={entry.isCurrentlyActive ? 1 : 0.6}
                  fill={
                    (entry.winRate ?? 0) >= 55
                      ? "var(--chart-3)"
                      : (entry.winRate ?? 0) >= 45
                        ? "var(--chart-1)"
                        : "var(--chart-5)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {hasHistorical ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t("maps.outOfPoolNote")}
        </p>
      ) : null}
    </div>
  );
}

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
import { mapDisplayName } from "@/lib/cs2/maps";
import type { MapPerformance } from "@/types";

export function MapPerformanceChart({
  data,
  height = 280,
}: {
  data: MapPerformance[];
  height?: number | undefined;
}) {
  const t = useT();

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex w-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("maps.noData")}</p>
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="map"
            tickFormatter={(value: string) => mapDisplayName(value)}
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
            {data.map((entry) => (
              <Cell
                key={entry.map}
                fill={
                  entry.winRate >= 55
                    ? "var(--chart-3)"
                    : entry.winRate >= 45
                      ? "var(--chart-1)"
                      : "var(--chart-5)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

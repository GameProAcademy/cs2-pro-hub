import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useT } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import type { DnaPoint } from "@/types";

export function DnaRadarChart({
  data,
  height = 380,
  showAverage = true,
}: {
  data: DnaPoint[];
  height?: number | undefined;
  showAverage?: boolean | undefined;
}) {
  const t = useT();
  const localized = data.map((point) => ({ ...point, label: t(dnaLabelKey(point.dimension)) }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={localized} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {showAverage ? (
            <Radar
              name={t("dna.chart.average")}
              dataKey="average"
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              fill="var(--muted-foreground)"
              fillOpacity={0.06}
            />
          ) : null}
          <Radar
            name={t("dna.chart.you")}
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="var(--chart-1)"
            fillOpacity={0.22}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

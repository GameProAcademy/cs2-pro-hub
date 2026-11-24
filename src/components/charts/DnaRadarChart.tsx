import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/i18n";
import { dnaLabelKey } from "@/lib/dna";
import { splitAxisLabel } from "@/lib/dnaAxisLabel";
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
  const mobile = useIsMobile();
  const localized = data.map((point) => ({ ...point, label: t(dnaLabelKey(point.dimension)) }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* UX-1.0 M-9: on narrow screens a smaller radius and two-line labels keep every axis
            label inside the chart (the radar stays full-width and the protagonist). */}
        <RadarChart data={localized} outerRadius={mobile ? "58%" : "72%"}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="label" tick={(props) => <AxisLabel {...props} />} />
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

function AxisLabel(props: {
  x?: number | string;
  y?: number | string;
  textAnchor?: string;
  payload?: { value?: unknown };
}) {
  const lines = splitAxisLabel(String(props.payload?.value ?? ""));
  const y = Number(props.y ?? 0);
  return (
    <text
      x={Number(props.x ?? 0)}
      y={lines.length > 1 ? y - 6 : y}
      textAnchor={(props.textAnchor as "start" | "middle" | "end" | undefined) ?? "middle"}
      fill="var(--muted-foreground)"
      fontSize={11}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={Number(props.x ?? 0)} dy={i === 0 ? 0 : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

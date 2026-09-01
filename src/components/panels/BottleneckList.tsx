import { ProgressBar } from "@/components/common/ProgressBar";
import type { Bottleneck, Priority } from "@/types";
import { cn } from "@/lib/utils";

const priorityTone: Record<Priority, string> = {
  Crítica: "border-destructive/40 bg-destructive/12 text-destructive",
  Alta: "border-warning/40 bg-warning/12 text-warning",
  Média: "border-accent/40 bg-accent/12 text-accent",
};

export function BottleneckList({ items }: { items: Bottleneck[] }) {
  return (
    <ul className="space-y-4">
      {items.map((item, index) => (
        <li key={item.id} className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num-display text-xs text-muted-foreground">
              #{String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              {item.area}
            </h3>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                priorityTone[item.priority],
              )}
            >
              {item.priority}
            </span>
            <span className="ml-auto font-mono text-xs text-destructive">{item.impact}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.explanation}</p>
          <ProgressBar
            className="mt-4"
            value={item.confidence}
            label="Confiança da análise"
            showValue
            tone="accent"
          />
        </li>
      ))}
    </ul>
  );
}

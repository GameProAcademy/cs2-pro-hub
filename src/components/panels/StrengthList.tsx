import { Check } from "lucide-react";

import { ProgressBar } from "@/components/common/ProgressBar";
import type { Strength } from "@/types";

export function StrengthList({ items }: { items: Strength[] }) {
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-sm bg-success/15 text-success">
              <Check className="size-3.5" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              {item.area}
            </h3>
            <span className="ml-auto font-mono text-xs text-success">
              P{item.percentile}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
          <ProgressBar className="mt-4" value={item.percentile} tone="success" />
        </li>
      ))}
    </ul>
  );
}

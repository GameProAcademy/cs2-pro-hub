/**
 * VGL 3.0 — Competitive HUD family. `SegmentedCount` draws "done of due" as one segment per unit,
 * the same two integers the text states (no rate, no rounding). Above `max` units it draws nothing,
 * so a long plan never becomes an unreadable bar.
 */
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export function SegmentedCount({
  done,
  due,
  max = 30,
  className,
}: {
  done: number;
  due: number;
  max?: number;
  className?: string;
}) {
  if (!Number.isInteger(done) || !Number.isInteger(due) || due <= 0 || due > max || done < 0)
    return null;
  const filled = Math.min(done, due);
  return (
    <span
      aria-hidden
      className={cn("flex w-full max-w-md gap-1", className)}
      data-segmented-count={`${filled}/${due}`}
    >
      {Array.from({ length: due }, (_, i) => (
        <span
          key={i}
          className={cn(
            "vgl-rise h-2 flex-1 rounded-sm",
            i < filled ? "bg-primary" : "border border-border-strong bg-background/40",
          )}
          style={{ "--vgl-i": i } as CSSProperties}
        />
      ))}
    </span>
  );
}

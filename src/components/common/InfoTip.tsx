/**
 * VGL 5.0 — an explanation one click/tap/keypress away, in the site's standard tooltip pattern
 * (the same Popover + help icon as `MetricTerm`): works on touch and with the keyboard, never
 * hover-only. The text is the complete explanation; nothing is shortened.
 */
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function InfoTip({
  label,
  title,
  children,
  showLabel = false,
  className,
  id,
}: {
  /** Accessible name of the button (and its visible text when `showLabel`). */
  label: string;
  /** Optional heading inside the popover. */
  title?: string;
  children: ReactNode;
  showLabel?: boolean;
  className?: string;
  /** Stable hook for tests (`data-info-tip`). */
  id?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={showLabel ? undefined : label}
          className={cn(
            "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showLabel
              ? "border border-border bg-background/60 px-2.5"
              : "-m-1 size-8 justify-center",
            className,
          )}
          data-info-tip={id ?? ""}
        >
          <CircleHelp className="size-3.5" aria-hidden />
          {showLabel ? <span>{label}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(22rem,calc(100vw-2rem))] text-left normal-case tracking-normal"
        align="start"
        collisionPadding={12}
      >
        {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
        <div className={cn("text-xs leading-relaxed text-muted-foreground", title && "mt-1")}>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

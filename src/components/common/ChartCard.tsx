import type { ReactNode } from "react";

import { DemoTag } from "@/components/common/DemoDataNotice";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  showDemoTag = true,
  icon,
}: {
  title: string;
  /** Optional game icon for the panel (decorative; the title carries the meaning). */
  icon?: GameIconName | undefined;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  showDemoTag?: boolean | undefined;
}) {
  return (
    <section
      className={cn(
        "surface-panel flex flex-col overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border bg-elevated/40 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary"
              data-card-icon={icon}
            >
              <GameIcon name={icon} className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-wide text-foreground">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {showDemoTag ? <DemoTag /> : null}
        </div>
      </header>
      <div className="flex-1 p-4 sm:p-5">{children}</div>
    </section>
  );
}

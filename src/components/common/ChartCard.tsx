import type { ReactNode } from "react";

import { DemoTag } from "@/components/common/DemoDataNotice";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  showDemoTag = true,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  showDemoTag?: boolean | undefined;
}) {
  return (
    <section
      className={cn("surface-panel flex flex-col rounded-lg border border-border", className)}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
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

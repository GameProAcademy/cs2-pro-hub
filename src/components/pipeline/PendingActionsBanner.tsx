/**
 * PR5 — persistent pending actions. Lists every demo that waits for the player's
 * identification (no stacked modals): each entry opens the upload modal on the selection
 * step for that job. Amber = action needed.
 */
import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePendingDemoActions } from "@/hooks/usePendingDemoActions";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

const MAX_LISTED = 5;

export function PendingActionsBanner({ className }: { className?: string }) {
  const t = useT();
  const { pending, count } = usePendingDemoActions();
  if (count === 0) return null;
  const listed = pending.slice(0, MAX_LISTED);
  return (
    <section
      aria-labelledby="pending-actions-title"
      data-pending-count={count}
      className={cn("rounded-lg border border-warning/35 bg-warning/8 p-4 sm:p-5", className)}
    >
      <div className="flex items-start gap-3">
        <UserRound className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="pending-actions-title" className="text-sm font-semibold text-warning">
            {count === 1
              ? t("pending.titleOne")
              : t("pending.titleMany").replace("{count}", String(count))}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("pending.body")}</p>
          <ul className="mt-3 space-y-2">
            {listed.map((job) => (
              <li
                key={job.jobId}
                className="flex min-w-0 flex-col gap-2 rounded-md border border-border/70 bg-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 truncate text-sm text-foreground" title={job.fileName}>
                  {job.fileName || t("pending.unnamed")}
                  {job.map ? (
                    <span className="ml-2 font-mono text-[11px] uppercase text-muted-foreground">
                      {job.map}
                    </span>
                  ) : null}
                </span>
                <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                  <Link to="/upload" search={{ identify: job.jobId }}>
                    {t("pending.cta")}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
          {count > MAX_LISTED ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("pending.more").replace("{count}", String(count - MAX_LISTED))}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Small count badge for the menu entry and the header button. */
export function PendingActionsBadge({ className }: { className?: string }) {
  const t = useT();
  const { count } = usePendingDemoActions();
  if (count === 0) return null;
  const label = t("pending.navLabel").replace("{count}", String(count));
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1.5 font-mono text-[10px] font-semibold leading-5 text-background",
        className,
      )}
      aria-label={label}
      title={label}
      data-pending-count={count}
    >
      {count}
    </span>
  );
}

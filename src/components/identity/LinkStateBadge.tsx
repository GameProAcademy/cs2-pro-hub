/** The ONE rendering of an external account's link state (see `deriveLinkState`). */
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { ExternalLinkState } from "@/lib/identity/linkState";
import { cn } from "@/lib/utils";

const CLASS: Record<ExternalLinkState, string> = {
  SYNCED: "border-success/30 bg-success/10 text-success",
  VERIFIED: "border-success/30 bg-success/10 text-success",
  SYNC_PENDING: "border-primary/30 bg-primary/10 text-primary",
  PENDING: "border-warning/30 bg-warning/10 text-warning",
  ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
  NOT_LINKED: "border-border bg-secondary text-muted-foreground",
  UNAVAILABLE: "border-border bg-secondary text-muted-foreground",
};

export function LinkStateBadge({ state }: { state: ExternalLinkState }) {
  const t = useT();
  return (
    <span
      data-link-state={state}
      className={cn(
        "rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-wider",
        CLASS[state],
      )}
    >
      {t(`link.state.${state}` as TranslationKey)}
    </span>
  );
}

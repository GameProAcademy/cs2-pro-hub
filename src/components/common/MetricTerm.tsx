/**
 * A metric name with its definition one tap/click/keypress away (Popover, not a hover-only
 * tooltip, so it works on touch screens and with the keyboard). Names and definitions come
 * from the single glossary (src/lib/glossary.ts + i18n `glossary.*`).
 */
import { CircleHelp } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { fillGlossary, glossaryKeys, type MetricId } from "@/lib/glossary";
import { cn } from "@/lib/utils";

export function useGlossary() {
  const t = useT();
  return (id: MetricId) => {
    const keys = glossaryKeys(id);
    return {
      label: t(keys.label as TranslationKey),
      short: t(keys.short as TranslationKey),
      definition: fillGlossary(t(keys.definition as TranslationKey)),
    };
  };
}

export function MetricTerm({
  id,
  variant = "short",
  className,
}: {
  id: MetricId;
  /** "short" for compact headers (ADR), "label" for the descriptive name. */
  variant?: "short" | "label";
  className?: string | undefined;
}) {
  const t = useT();
  const term = useGlossary()(id);
  const text = variant === "label" ? term.label : term.short;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{text}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("glossary.open").replace("{term}", term.label)}
            data-glossary-term={id}
          >
            <CircleHelp className="size-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 text-left normal-case tracking-normal" align="start">
          <p className="text-sm font-semibold text-foreground">{term.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{term.definition}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/** Full glossary list (Performance page): every canonical metric with its definition. */
export function GlossaryList({ ids }: { ids: readonly MetricId[] }) {
  const glossary = useGlossary();
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-metric-glossary>
      {ids.map((id) => {
        const term = glossary(id);
        return (
          <details
            key={id}
            className="group min-w-0 rounded-md border border-border bg-background/40 p-3"
            data-glossary-entry={id}
          >
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              <span>{term.label}</span>
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8">
                  <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>
            <dd className="mt-2 border-t border-border/70 pt-2 text-xs leading-relaxed text-muted-foreground">
              {term.definition}
            </dd>
          </details>
        );
      })}
    </dl>
  );
}

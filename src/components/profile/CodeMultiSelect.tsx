/**
 * Multi-select over STABLE CODES. The label is translated, the stored value is
 * always the code, so changing language never changes what is persisted.
 */
import { Check } from "lucide-react";

import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function CodeMultiSelect({
  codes,
  selected,
  onChange,
  labelKey,
  disabled = false,
  primaryFirst = false,
  primaryLabel,
}: {
  codes: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  labelKey: (code: string) => TranslationKey;
  disabled?: boolean;
  /** Marks the first selected code as primary (used for goals). */
  primaryFirst?: boolean;
  primaryLabel?: string;
}) {
  const t = useT();

  const toggle = (code: string) => {
    if (disabled) return;
    onChange(
      selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code],
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {codes.map((code) => {
        const active = selected.includes(code);
        const isPrimary = primaryFirst && active && selected[0] === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => toggle(code)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
              disabled && "opacity-60",
            )}
          >
            {active ? <Check className="size-3" aria-hidden /> : null}
            {t(labelKey(code))}
            {isPrimary && primaryLabel ? (
              <span className="ml-1 rounded bg-primary/20 px-1 font-mono text-[9px] uppercase tracking-wider">
                {primaryLabel}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

import { Globe } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_LOCALE, dictionaries, LOCALE_OPTIONS, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const subscribeToHydration = () => () => undefined;
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

/** Single control for language switching. Persistence lives in the i18n layer. */
export function LanguageSelector({
  className,
  compact = false,
}: {
  className?: string | undefined;
  compact?: boolean | undefined;
}) {
  const { locale, setLocale, t } = useI18n();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot,
  );
  const renderedLocale = hydrated ? locale : DEFAULT_LOCALE;
  const current = LOCALE_OPTIONS.find((o) => o.value === renderedLocale);
  const languageLabel = hydrated
    ? t("common.language")
    : dictionaries[DEFAULT_LOCALE]["common.language"];

  return (
    <Select value={renderedLocale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger
        aria-label={languageLabel}
        className={cn(
          "h-9 w-auto gap-2 border-border/80 bg-card/60 px-3 text-xs font-medium",
          className,
        )}
      >
        <Globe className="size-3.5 text-muted-foreground" aria-hidden />
        <SelectValue>
          <span className="flex items-center gap-1.5">
            <span aria-hidden>{current?.flag}</span>
            <span className={cn(compact && "sr-only")}>{current?.label}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {LOCALE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <span aria-hidden>{option.flag}</span>
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

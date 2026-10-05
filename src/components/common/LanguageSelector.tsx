import { Globe } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCALE_OPTIONS, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Single control for language switching. Persistence lives in the i18n layer. */
export function LanguageSelector({
  className,
  compact = false,
}: {
  className?: string | undefined;
  compact?: boolean | undefined;
}) {
  const { locale, setLocale, t } = useI18n();
  const current = LOCALE_OPTIONS.find((o) => o.value === locale);

  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger
        aria-label={t("common.language")}
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

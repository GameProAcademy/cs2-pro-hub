/**
 * ISO 3166-1 alpha-2 country picker. The initial suggestion comes from the
 * browser (language, then timezone); the persisted value always wins.
 */
import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, useT } from "@/i18n";
import { sortedCountries } from "@/lib/profile/taxonomy";

export function CountrySelect({
  value,
  onChange,
  id = "country",
  disabled = false,
}: {
  value: string | null;
  onChange: (code: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const countries = useMemo(() => sortedCountries(intlTag), [intlTag]);

  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => {
        // Radix emits "" from its hidden native select on mount; ignore it.
        if (next) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={t("profile.selectPlaceholder")} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {countries.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            <span aria-hidden>{country.flag}</span> {country.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

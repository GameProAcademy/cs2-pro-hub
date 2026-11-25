import { useT } from "@/i18n";

/**
 * enemy-hp-v1 coverage marker: shown next to an ADR when some of the player's hits were left out
 * (victim side unknown, or the health removed could not be determined). The value is a floor —
 * nothing is estimated or filled in.
 */
export function AdrPartialMark() {
  const t = useT();
  return (
    <span
      data-adr-partial="true"
      title={t("adr.partial.hint")}
      className="ml-1.5 inline-flex items-center rounded border border-warning/40 px-1 py-px align-middle font-sans text-xs uppercase leading-none tracking-wide text-warning"
    >
      {t("adr.partial")}
      <span className="sr-only">: {t("adr.partial.hint")}</span>
    </span>
  );
}

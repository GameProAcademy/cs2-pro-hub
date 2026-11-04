/**
 * CS2 PRO glossary — the ONE place where metric names and definitions live.
 *
 * Every screen that shows a metric uses these canonical ids (label, short label and
 * definition come from i18n `glossary.<id>.*`). Definitions describe what THIS product
 * computes (src/lib/pipeline/metrics.ts, src/lib/playerOverview.ts), never an external
 * product's formula. Numeric windows are injected from src/config/pipeline.ts so the text
 * can never drift from the engine.
 */
import { FLASH_ASSIST_WINDOW_SECONDS, TRADE_WINDOW_SECONDS } from "@/config/pipeline";

export const METRIC_IDS = [
  "kd",
  "adr",
  "kast",
  "hsPercent",
  "rating",
  "winRate",
  "openingKills",
  "openingDeaths",
  "tradeKills",
  "flashAssists",
  "clutch",
  "utility",
  "proScore",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export function glossaryKeys(id: MetricId): { label: string; short: string; definition: string } {
  return {
    label: `glossary.${id}.label`,
    short: `glossary.${id}.short`,
    definition: `glossary.${id}.definition`,
  };
}

/** Values interpolated into definitions: the engine's own configuration. */
export const GLOSSARY_VARS: Record<string, string | number> = {
  tradeWindow: TRADE_WINDOW_SECONDS,
  flashWindow: FLASH_ASSIST_WINDOW_SECONDS,
};

export function fillGlossary(
  text: string,
  vars: Record<string, string | number> = GLOSSARY_VARS,
): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

import type { TranslationKey } from "@/i18n/config";
import type { DnaDimension } from "@/types";

/**
 * Player DNA slugs are stable internal identifiers (also used in the database).
 * The user-facing name always comes from i18n, never from the data itself.
 */
export function dnaLabelKey(dimension: DnaDimension): TranslationKey {
  return `dna.dim.${dimension}` as TranslationKey;
}

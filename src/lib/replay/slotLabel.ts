import type { TranslationKey } from "@/i18n";

/**
 * UX-1.0 (D-33): "ally:N" / "enemy:N" are match-stable anonymous identities; older per-round
 * labels ("T1", "CT2") are shown as they are.
 */
export function replaySlotLabel(slot: string | null, t: (key: TranslationKey) => string): string {
  if (slot === null) return t("replay.event.unknown");
  if (slot === "you") return t("replay.slot.you");
  const m = /^(ally|enemy):(\d+)$/.exec(slot);
  if (m) return t(m[1] === "ally" ? "replay.slot.ally" : "replay.slot.enemy").replace("{n}", m[2]!);
  return slot;
}

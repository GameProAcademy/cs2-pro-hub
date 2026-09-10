/**
 * FASE 2.7.1 — CENTRAL DEFINITION OF EVIDENCE CLASSES.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * "Do we have utility evidence?" was answered in two different places (the
 * normalizer's `missing_utility` quality flag and
 * `metricsAvailability().utilityEvents`) with two divergent event lists. Two
 * definitions of the same fact eventually disagree, and a disagreement here
 * turns "we cannot know" into "it did not happen".
 *
 * So the classification of canonical event types into evidence classes lives
 * HERE, once, and both layers import it.
 *
 * SEMANTICS (non-negotiable)
 * --------------------------
 * An evidence class describes THE DATASET, never a player's activity:
 *   available = the observation contains events of that class;
 *   unavailable = the observation contains none, so every dependent signal is
 *   NULL (unknown), never 0.
 * A player who threw no grenade in an observation that DOES carry utility
 * events is an OBSERVED ZERO and must be emitted as 0.
 */
import type { CanonicalEvent, CanonicalEventType } from "@/lib/pipeline/types";

/**
 * Utility evidence classes.
 *
 * `flash`, `smoke`, `molotov`, `incendiary` and `he` are all first-class
 * utility detonations in the canonical contract. `incendiary` is the
 * `inferno_startburn` alias of a molotov/incgrenade burn and counts exactly the
 * same; `smoke` carries no damage but is still utility usage evidence.
 * `weapon_purchase` is NOT utility evidence: buying a grenade is not throwing
 * one.
 */
export const UTILITY_EVENT_TYPES: readonly CanonicalEventType[] = [
  "flash",
  "smoke",
  "molotov",
  "incendiary",
  "he",
];

/** Utility events that can produce damage (used by utility-damage attribution). */
export const UTILITY_DAMAGE_EVENT_TYPES: readonly CanonicalEventType[] = [
  "molotov",
  "incendiary",
  "he",
];

const UTILITY_SET: ReadonlySet<string> = new Set(UTILITY_EVENT_TYPES);

export function isUtilityEvent(event: CanonicalEvent): boolean {
  return UTILITY_SET.has(event.type);
}

/** True when the observation carries ANY utility event (dataset-level fact). */
export function hasUtilityEvidence(events: readonly CanonicalEvent[]): boolean {
  return events.some(isUtilityEvent);
}

export function hasKillEvidence(events: readonly CanonicalEvent[]): boolean {
  return events.some((e) => e.type === "kill");
}

export function hasDamageEvidence(events: readonly CanonicalEvent[]): boolean {
  return events.some((e) => e.type === "damage");
}

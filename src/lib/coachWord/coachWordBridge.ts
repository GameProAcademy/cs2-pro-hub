/**
 * VGL 5.0 — "Talk to the Coach" from a Palavra do Treinador card: opens the AI Coach drawer on
 * the current page with a suggested question in the composer. Nothing is sent automatically:
 * the player reviews and sends it. A browser event keeps the card decoupled from the drawer.
 */
export const OPEN_COACH_EVENT = "cs2pro:open-coach";
export const COACH_DNA_HISTORY_KEY = ["player", "dna", "history"] as const;

export interface OpenCoachDetail {
  draft: string;
}

export function openCoachWith(draft: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenCoachDetail>(OPEN_COACH_EVENT, { detail: { draft: draft.slice(0, 600) } }),
  );
}

/**
 * R-07 · round-winner-evidence-v1 — who won a round, how it was determined and how sure it is.
 *
 * The parser (services/cs2-demo-parser/adapter.py `round_winner_evidence`) reads two sources: the
 * demo's `round_end` event and the game state (`round_win_status` agreeing with the team whose
 * `team_rounds_total` rose by one). The result travels in `match_rounds.metadata.winnerEvidence`
 * (no schema change). A winner exists only when the status is `confirmed`; a conflict is never
 * resolved by picking a source, and an absent or inconclusive round is never a loss.
 *
 * Rows persisted before this contract have no evidence: their `winner_side` stays as recorded
 * (origin not recorded), exactly as before.
 */
import type { Side } from "@/lib/pipeline/types";

export const ROUND_WINNER_EVIDENCE_VERSION = "round-winner-evidence-v1";

export type WinnerMethod = "round_end_event" | "game_state" | "both";
export type WinnerStatus = "confirmed" | "absent" | "inconclusive" | "conflicting";

export interface WinnerEvidence {
  version: typeof ROUND_WINNER_EVIDENCE_VERSION;
  method: WinnerMethod | null;
  status: WinnerStatus;
  sources: { roundEndEvent: Side | null; gameState: Side | null };
}

const METHODS: readonly string[] = ["round_end_event", "game_state", "both"];
const STATUSES: readonly string[] = ["confirmed", "absent", "inconclusive", "conflicting"];
const side = (v: unknown): Side | null => (v === "CT" || v === "T" ? v : null);

/** From the parser's round fields. Unknown or malformed values → null (no evidence). */
export function winnerEvidenceFromParser(round: {
  winner_method?: unknown;
  winner_status?: unknown;
  winner_sources?: unknown;
}): WinnerEvidence | null {
  if (typeof round.winner_status !== "string" || !STATUSES.includes(round.winner_status))
    return null;
  const method =
    typeof round.winner_method === "string" && METHODS.includes(round.winner_method)
      ? (round.winner_method as WinnerMethod)
      : null;
  const s = (round.winner_sources ?? {}) as Record<string, unknown>;
  return {
    version: ROUND_WINNER_EVIDENCE_VERSION,
    method,
    status: round.winner_status as WinnerStatus,
    sources: { roundEndEvent: side(s["round_end_event"]), gameState: side(s["game_state"]) },
  };
}

/** From `match_rounds.metadata`. Absent or malformed → null (legacy row). */
export function winnerEvidenceFromMetadata(metadata: unknown): WinnerEvidence | null {
  if (!metadata || typeof metadata !== "object") return null;
  const e = (metadata as Record<string, unknown>)["winnerEvidence"];
  if (!e || typeof e !== "object") return null;
  const v = e as Record<string, unknown>;
  if (v["version"] !== ROUND_WINNER_EVIDENCE_VERSION) return null;
  if (typeof v["status"] !== "string" || !STATUSES.includes(v["status"])) return null;
  const s = (v["sources"] ?? {}) as Record<string, unknown>;
  return {
    version: ROUND_WINNER_EVIDENCE_VERSION,
    method:
      typeof v["method"] === "string" && METHODS.includes(v["method"])
        ? (v["method"] as WinnerMethod)
        : null,
    status: v["status"] as WinnerStatus,
    sources: { roundEndEvent: side(s["roundEndEvent"]), gameState: side(s["gameState"]) },
  };
}

/**
 * The winner a screen may use. With evidence: only a confirmed status gives a winner (a stale
 * `winner_side` kept by the persistence COALESCE on a reprocessed conflict is ignored). Without
 * evidence (rows before the contract): the recorded `winner_side`, unchanged.
 */
export function determinedWinnerSide(row: {
  winner_side?: string | null;
  metadata?: unknown;
}): Side | null {
  const evidence = winnerEvidenceFromMetadata(row.metadata);
  if (evidence && evidence.status !== "confirmed") return null;
  return side(typeof row.winner_side === "string" ? row.winner_side.toUpperCase() : null);
}

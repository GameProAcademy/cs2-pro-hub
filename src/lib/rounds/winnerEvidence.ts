/**
 * R-07 · O8 · round-winner-evidence-v1 — who won a round, how it was determined and how sure it is.
 *
 * The parser (services/cs2-demo-parser/adapter.py `round_winner_evidence`) reads two sources: the
 * demo's `round_end` event and the game state (`round_win_status` agreeing with the team whose
 * `team_rounds_total` rose by one). The result is `CanonicalRound.metadata = {winnerEvidence}`
 * (`match_rounds.metadata`), governed by decision O8 of canonical-demo-v3.
 *
 * Closed schema (mirrored by scripts/canonical_v3/harness.py `winner_evidence_errors`):
 *
 *   { version: "round-winner-evidence-v1",
 *     status:  "confirmed" | "absent" | "inconclusive" | "conflicting",
 *     method:  "round_end_event" | "game_state" | "both" | null,
 *     sources: { roundEndEvent: "CT" | "T" | null, gameState: "CT" | "T" | null } }
 *
 *   confirmed    method both (sources equal) | round_end_event (only the event) | game_state (only the state)
 *   conflicting  method both, both sources present and different
 *   inconclusive method game_state, no source (the two game-state observations disagreed)
 *   absent       method null, no source
 *
 * A winner exists only when the status is `confirmed`; a conflict is never resolved by picking a
 * source; an absent, inconclusive or conflicting round is never a win, a loss or a tie. Rows written
 * before this contract have no evidence: their `winner_side` stays as recorded.
 */
import type { Side } from "@/lib/pipeline/types";

export const ROUND_WINNER_EVIDENCE_VERSION = "round-winner-evidence-v1";

export type WinnerMethod = "round_end_event" | "game_state" | "both";
export type WinnerStatus = "confirmed" | "absent" | "inconclusive" | "conflicting";

export interface WinnerEvidence {
  version: typeof ROUND_WINNER_EVIDENCE_VERSION;
  status: WinnerStatus;
  method: WinnerMethod | null;
  sources: { roundEndEvent: Side | null; gameState: Side | null };
}

const SIDES: readonly unknown[] = [null, "CT", "T"];
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const sameKeys = (o: Record<string, unknown>, keys: readonly string[]) => {
  const k = Object.keys(o).sort();
  return k.length === keys.length && [...keys].sort().every((x, i) => x === k[i]);
};

/** [] when `metadata` is exactly `{winnerEvidence}` with a valid evidence; otherwise the reasons. */
export function winnerEvidenceErrors(metadata: unknown): string[] {
  if (!isObject(metadata) || !sameKeys(metadata, ["winnerEvidence"])) return ["metadata_keys"];
  const ev = metadata["winnerEvidence"];
  if (!isObject(ev) || !sameKeys(ev, ["version", "status", "method", "sources"]))
    return ["evidence_keys"];
  const src = ev["sources"];
  if (!isObject(src) || !sameKeys(src, ["roundEndEvent", "gameState"])) return ["sources_keys"];
  const errors: string[] = [];
  if (ev["version"] !== ROUND_WINNER_EVIDENCE_VERSION) errors.push("version");
  const event = src["roundEndEvent"];
  const state = src["gameState"];
  if (!SIDES.includes(event) || !SIDES.includes(state)) errors.push("source_side");
  const method = ev["method"];
  const rules: Record<string, boolean> = {
    confirmed:
      (method === "both" && event !== null && event === state) ||
      (method === "round_end_event" && event !== null && state === null) ||
      (method === "game_state" && state !== null && event === null),
    conflicting: method === "both" && event !== null && state !== null && event !== state,
    inconclusive: method === "game_state" && event === null && state === null,
    absent: method === null && event === null && state === null,
  };
  const status = ev["status"];
  if (typeof status !== "string" || !(status in rules)) errors.push("status");
  else if (!rules[status]) errors.push(`incoherent_${status}`);
  return errors;
}

/** The side a confirmed evidence names; null for every other status (never a guess). */
export function confirmedSide(evidence: WinnerEvidence): Side | null {
  if (evidence.status !== "confirmed") return null;
  return evidence.sources.roundEndEvent ?? evidence.sources.gameState;
}

export type ParserWinnerEvidence =
  | { kind: "legacy" }
  | { kind: "valid"; evidence: WinnerEvidence }
  | { kind: "malformed"; errors: string[] };

/**
 * From the parser's round fields. `legacy` = a parser before the contract (none of the three
 * fields); `malformed` = present but outside the closed schema (fail closed: no winner, no evidence).
 */
export function winnerEvidenceFromParser(round: {
  winner_method?: unknown;
  winner_status?: unknown;
  winner_sources?: unknown;
}): ParserWinnerEvidence {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(round, k);
  if (!has("winner_method") && !has("winner_status") && !has("winner_sources"))
    return { kind: "legacy" };
  const s = round.winner_sources;
  if (!isObject(s) || !sameKeys(s, ["round_end_event", "game_state"]))
    return { kind: "malformed", errors: ["sources_keys"] };
  const candidate = {
    version: ROUND_WINNER_EVIDENCE_VERSION,
    status: round.winner_status,
    method: round.winner_method ?? null,
    sources: { roundEndEvent: s["round_end_event"] ?? null, gameState: s["game_state"] ?? null },
  };
  const errors = winnerEvidenceErrors({ winnerEvidence: candidate });
  return errors.length
    ? { kind: "malformed", errors }
    : { kind: "valid", evidence: candidate as WinnerEvidence };
}

/** From `match_rounds.metadata`. Absent or malformed → null (legacy row, or not trusted). */
export function winnerEvidenceFromMetadata(metadata: unknown): WinnerEvidence | null {
  if (!isObject(metadata) || !("winnerEvidence" in metadata)) return null;
  if (winnerEvidenceErrors({ winnerEvidence: metadata["winnerEvidence"] }).length) return null;
  return metadata["winnerEvidence"] as WinnerEvidence;
}

/**
 * The winner a screen may use. With evidence: only a confirmed status gives a winner (a stale
 * `winner_side` kept by the persistence COALESCE on a reprocessed conflict is ignored). Without
 * evidence (rows before the contract): the recorded `winner_side`, unchanged. Evidence present but
 * malformed: no winner.
 */
export function determinedWinnerSide(row: {
  winner_side?: string | null;
  metadata?: unknown;
}): Side | null {
  const hasKey = isObject(row.metadata) && "winnerEvidence" in row.metadata;
  const evidence = winnerEvidenceFromMetadata(row.metadata);
  if (hasKey && !evidence) return null;
  if (evidence) return confirmedSide(evidence);
  const recorded = typeof row.winner_side === "string" ? row.winner_side.toUpperCase() : null;
  return recorded === "CT" || recorded === "T" ? recorded : null;
}

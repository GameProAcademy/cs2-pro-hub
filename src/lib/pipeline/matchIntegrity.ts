/**
 * PM6 C — match integrity and end-of-match eligibility (`cs2.match-integrity.v1`).
 *
 * Pure decision over bounded, identity-free evidence. It answers one question: does this demo
 * record a match that ended officially (normally or by surrender) with enough valid, actually
 * played rounds for a reliable analysis? It never invents rounds, never extrapolates a partial
 * match and never treats the end of the file as the end of the match.
 *
 * Signal hierarchy, measured on the PM6 corpus (docs/pm6/PM6_MATCH_INTEGRITY.md):
 *  - HIGH  `game_phase` = 5 (CCSGameRules GAMEPHASE_MATCH_ENDED) at the tick of the final
 *          round_end. Present on every officially finished corpus demo (FACEIT, GamersClub
 *          Mirage, BLAST), including GamersClub demos without cs_win_panel_match.
 *  - HIGH  final round_end reason `t_surrender`/`ct_surrender` (CS round-end reasons 17/18):
 *          an official surrender. No corpus demo has one yet (IMPLEMENTED_NOT_VALIDATED).
 *  - MEDIUM `cs_win_panel_match` at/after the final round_end. Corroborates; never required.
 *  - NONE  end of file. Never sufficient on its own.
 * The minimum number of valid rounds (9) is the CS2 PRO eligibility rule, inspired by SCOPE.GG's
 * public policy for surrendered matches. It is not a Valve rule.
 */

export const MATCH_INTEGRITY_CONTRACT = {
  id: "cs2.match-integrity.v1",
  minValidRounds: 9,
  matchEndedGamePhase: 5,
  surrenderReasons: ["t_surrender", "ct_surrender"] as readonly string[],
} as const;

export type MatchIntegrityStatus =
  | "MATCH_COMPLETED"
  | "MATCH_SURRENDER_COMPLETED"
  | "MATCH_END_UNVERIFIED"
  | "MATCH_DEMO_TRUNCATED"
  | "MATCH_DEMO_CORRUPTED"
  | "MATCH_FINAL_ROUND_INCOMPLETE"
  | "MATCH_INSUFFICIENT_ROUNDS"
  | "MATCH_LIFECYCLE_INCONSISTENT"
  | "MATCH_PLAYER_COVERAGE_INSUFFICIENT";

export type SignalReliability = "HIGH" | "MEDIUM" | "NONE";

/** One observed round boundary pair. Identity-free. */
export interface MatchEndRoundEvidence {
  number: number;
  startTick: number | null;
  endTick: number | null;
  winner: "T" | "CT" | null;
  /** demoparser2 round-end reason token (e.g. `t_killed`, `t_surrender`). */
  reason: string | null;
  /** CCSGameRules m_gamePhase at the round_end tick, when the producer read it. */
  gamePhaseAtEnd: number | null;
  /** Round voided by a match reset (begin_new_match / total_rounds_played back to 0). */
  voided?: boolean | undefined;
}

export interface MatchEndEvidenceV1 {
  rounds: MatchEndRoundEvidence[];
  /** Ticks of cs_win_panel_match, if the stream was read; null when unavailable. */
  winPanelTicks: number[] | null;
  /** The demo could not be read completely (parser reported a truncated stream). */
  truncated?: boolean | undefined;
  /** The demo is structurally unreadable or incompatible. */
  corrupted?: boolean | undefined;
  /** Participant inventory coverage from the player gate. */
  playerCoverage: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
}

export interface MatchEndSignal {
  signal: "GAME_PHASE_MATCH_ENDED" | "SURRENDER_ROUND_END" | "WIN_PANEL_MATCH" | "END_OF_FILE";
  reliability: SignalReliability;
  tick: number | null;
}

export interface MatchIntegrityDecision {
  contract: typeof MATCH_INTEGRITY_CONTRACT.id;
  status: MatchIntegrityStatus;
  eligible: boolean;
  endedBy: "NORMAL" | "SURRENDER" | null;
  validRounds: number;
  minValidRounds: number;
  /** Rounds excluded from the count and why (counts only). */
  excluded: { voided: number; duplicate: number; incomplete: number };
  signals: MatchEndSignal[];
  reasons: string[];
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidRound(round: MatchEndRoundEvidence): boolean {
  return (
    !round.voided &&
    finite(round.startTick) &&
    finite(round.endTick) &&
    round.endTick >= round.startTick &&
    (round.winner === "T" || round.winner === "CT")
  );
}

export function evaluateMatchIntegrity(evidence: MatchEndEvidenceV1): MatchIntegrityDecision {
  const contract = MATCH_INTEGRITY_CONTRACT;
  const reasons: string[] = [];
  const signals: MatchEndSignal[] = [];
  const excluded = { voided: 0, duplicate: 0, incomplete: 0 };

  // Count each played round once: duplicates (same end tick, or same number) are dropped.
  const seenEnds = new Set<number>();
  const seenNumbers = new Set<number>();
  const live: MatchEndRoundEvidence[] = [];
  for (const round of [...evidence.rounds].sort(
    (a, b) => (a.endTick ?? a.startTick ?? 0) - (b.endTick ?? b.startTick ?? 0),
  )) {
    if (round.voided) {
      excluded.voided += 1;
      continue;
    }
    const key = finite(round.endTick) ? round.endTick : null;
    if ((key !== null && seenEnds.has(key)) || seenNumbers.has(round.number)) {
      excluded.duplicate += 1;
      continue;
    }
    if (key !== null) seenEnds.add(key);
    seenNumbers.add(round.number);
    live.push(round);
  }
  const valid = live.filter(isValidRound);
  excluded.incomplete = live.length - valid.length;
  const final = live.at(-1) ?? null;
  const finalValid = final !== null && isValidRound(final);

  const decide = (
    status: MatchIntegrityStatus,
    endedBy: "NORMAL" | "SURRENDER" | null = null,
  ): MatchIntegrityDecision => ({
    contract: contract.id,
    status,
    eligible: status === "MATCH_COMPLETED" || status === "MATCH_SURRENDER_COMPLETED",
    endedBy,
    validRounds: valid.length,
    minValidRounds: contract.minValidRounds,
    excluded,
    signals,
    reasons,
  });

  if (evidence.corrupted) {
    reasons.push("demo_structurally_unreadable");
    return decide("MATCH_DEMO_CORRUPTED");
  }
  if (evidence.truncated) {
    reasons.push("demo_stream_truncated");
    return decide("MATCH_DEMO_TRUNCATED");
  }

  // Signals of the official end, each with its reliability.
  const finalEnd = final && finite(final.endTick) ? final.endTick : null;
  const phaseEnded = finalValid && final.gamePhaseAtEnd === contract.matchEndedGamePhase;
  if (phaseEnded)
    signals.push({ signal: "GAME_PHASE_MATCH_ENDED", reliability: "HIGH", tick: finalEnd });
  const surrender =
    finalValid && final.reason !== null && contract.surrenderReasons.includes(final.reason);
  if (surrender)
    signals.push({ signal: "SURRENDER_ROUND_END", reliability: "HIGH", tick: finalEnd });
  const panels = evidence.winPanelTicks ?? [];
  const panelAfterFinal = finalEnd !== null && panels.some((tick) => tick >= finalEnd);
  if (panelAfterFinal)
    signals.push({
      signal: "WIN_PANEL_MATCH",
      reliability: "MEDIUM",
      tick: panels.find((t) => t >= (finalEnd ?? 0)) ?? null,
    });
  signals.push({ signal: "END_OF_FILE", reliability: "NONE", tick: null });

  // Contradictions: a surrender before the last round, a match-ended phase before the last
  // round, or a win panel while the final round says the match is still being played.
  const earlier = live.slice(0, -1);
  if (earlier.some((r) => r.reason !== null && contract.surrenderReasons.includes(r.reason))) {
    reasons.push("surrender_before_final_round");
    return decide("MATCH_LIFECYCLE_INCONSISTENT");
  }
  if (earlier.some((r) => r.gamePhaseAtEnd === contract.matchEndedGamePhase)) {
    reasons.push("match_ended_phase_before_final_round");
    return decide("MATCH_LIFECYCLE_INCONSISTENT");
  }
  if (panelAfterFinal && finalValid && finite(final.gamePhaseAtEnd) && !phaseEnded && !surrender) {
    reasons.push("win_panel_contradicts_final_game_phase");
    return decide("MATCH_LIFECYCLE_INCONSISTENT");
  }

  if (final === null) {
    reasons.push("no_round_observed");
    return decide("MATCH_INSUFFICIENT_ROUNDS");
  }
  if (!finalValid) {
    reasons.push("final_round_without_end_or_winner");
    return decide("MATCH_FINAL_ROUND_INCOMPLETE");
  }
  if (!phaseEnded && !surrender && !panelAfterFinal) {
    reasons.push("no_official_end_signal");
    return decide("MATCH_END_UNVERIFIED");
  }
  if (valid.length < contract.minValidRounds) {
    reasons.push(`valid_rounds_below_minimum:${valid.length}<${contract.minValidRounds}`);
    return decide("MATCH_INSUFFICIENT_ROUNDS");
  }
  if (evidence.playerCoverage === "INSUFFICIENT") {
    reasons.push("player_coverage_insufficient");
    return decide("MATCH_PLAYER_COVERAGE_INSUFFICIENT");
  }
  reasons.push(surrender ? "official_surrender" : "official_end");
  return decide(
    surrender ? "MATCH_SURRENDER_COMPLETED" : "MATCH_COMPLETED",
    surrender ? "SURRENDER" : "NORMAL",
  );
}

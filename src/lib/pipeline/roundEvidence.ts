/**
 * FASE 2.7.1E — THE SINGLE DEFINITION OF "round-end evidence".
 *
 * Several layers (normalizer quality, metrics availability, per-round survival,
 * the survival denominator) need to answer the same question: does this round
 * carry evidence that it actually ended? Before this file each layer answered it
 * with its own subset of fields, so the same observation could be "valid" in one
 * layer and "unknown" in another. The rule now lives here, once.
 *
 * NULL ≠ ZERO: presence is tested with `!= null`, never with truthiness, so
 * `durationSeconds = 0` and `endTick = 0` remain valid evidence.
 */
export interface RoundEndEvidenceFields {
  winnerSide?: unknown;
  winnerTeam?: unknown;
  endTick?: number | null | undefined;
  durationSeconds?: number | null | undefined;
}

export function hasRoundEndEvidence(round: RoundEndEvidenceFields): boolean {
  return (
    round.winnerSide != null ||
    round.winnerTeam != null ||
    round.endTick != null ||
    round.durationSeconds != null
  );
}

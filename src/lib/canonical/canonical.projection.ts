/**
 * FASE 2.6 — PLAYER-MATCH PROJECTION.
 *
 * The canonical match is neutral. "My score", "my team" and "win/loss" only
 * exist relative to a participant, and are DERIVED here — never stored on the
 * match, so a 10-player match is one row, not ten.
 */
import type {
  CanonicalMatch,
  CanonicalMatchBundle,
  CanonicalSide,
  CanonicalTeamSlot,
  PlayerMatchProjection,
  PlayerMatchResult,
} from "./canonical.types";

function otherTeam(team: CanonicalTeamSlot | null): CanonicalTeamSlot | null {
  if (team === "team_a") return "team_b";
  if (team === "team_b") return "team_a";
  return null;
}

function resultFor(
  match: CanonicalMatch,
  team: CanonicalTeamSlot | null,
  own: number | null,
  other: number | null,
): PlayerMatchResult | null {
  // An unfinished match has no result. A tie is a draw only when both scores
  // are known — never when one of them is missing.
  if (!match.finished) return null;
  if (match.winnerTeam && team) return match.winnerTeam === team ? "win" : "loss";
  if (own === null || other === null) return null;
  if (own === other) return "draw";
  return own > other ? "win" : "loss";
}

/** Projects the canonical bundle onto ONE participant. */
export function projectPlayerMatch(
  bundle: CanonicalMatchBundle,
  participantKey: string,
): PlayerMatchProjection | null {
  const participant = bundle.participants.find((p) => p.participantKey === participantKey);
  if (!participant) return null;

  const team = participant.team;
  const opponentTeam = otherTeam(team);
  const own = team === "team_a" ? bundle.match.scoreTeamA : team === "team_b" ? bundle.match.scoreTeamB : null;
  const other =
    opponentTeam === "team_a"
      ? bundle.match.scoreTeamA
      : opponentTeam === "team_b"
        ? bundle.match.scoreTeamB
        : null;

  const rows = bundle.roundPlayers.filter((r) => r.participantKey === participantKey);
  const sides = [...new Set(rows.map((r) => r.side).filter((s): s is CanonicalSide => s !== null))];

  return {
    participantKey,
    internalPlayerId: participant.internalPlayerId,
    team,
    opponentTeam,
    teamName: team === "team_a" ? bundle.match.teamA : team === "team_b" ? bundle.match.teamB : null,
    opponentTeamName:
      opponentTeam === "team_a"
        ? bundle.match.teamA
        : opponentTeam === "team_b"
          ? bundle.match.teamB
          : null,
    scorePlayer: own,
    scoreOpponent: other,
    result: resultFor(bundle.match, team, own, other),
    sides,
    roundsPlayed: rows.length > 0 ? rows.length : null,
  };
}

/** Projection for every participant. Used by per-player metric derivation. */
export function projectAllPlayers(bundle: CanonicalMatchBundle): PlayerMatchProjection[] {
  return bundle.participants
    .map((p) => projectPlayerMatch(bundle, p.participantKey))
    .filter((p): p is PlayerMatchProjection => p !== null);
}

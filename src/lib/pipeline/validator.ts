/**
 * Backend-side demo validation. The browser is never trusted: every check runs
 * again on the server before the file reaches the parser.
 */
import {
  DEMO_EXTENSION,
  MAX_DEMO_SIZE_BYTES,
  MIN_DEMO_SIZE_BYTES,
  MIN_VALID_ROUNDS,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import type { CanonicalMatch } from "@/lib/pipeline/types";

/** Structural check of the file name/size before any download or parse. */
export function validateDemoFile(fileName: string, fileSize: number): void {
  if (!fileName.toLowerCase().endsWith(DEMO_EXTENSION)) {
    throw new PipelineError("INVALID_DEMO_FORMAT", "extension");
  }
  // An empty file is a distinct, precisely known cause — not "too small".
  if (fileSize <= 0) throw new PipelineError("DEMO_EMPTY");
  if (fileSize < MIN_DEMO_SIZE_BYTES) throw new PipelineError("DEMO_TOO_SMALL");
  if (fileSize > MAX_DEMO_SIZE_BYTES) throw new PipelineError("DEMO_TOO_LARGE");
}

/**
 * Canonical-data sanity check before anything is persisted.
 *
 * FASE 2.7 — EXPLICIT SHORT-DEMO POLICY. A short demo (warmup-only recording,
 * abandoned match, truncated file) is NOT a parser failure and NOT a corrupted
 * file: it is a valid recording with too small a sample to analyse. It gets its
 * own permanent code, `DEMO_INSUFFICIENT_SAMPLE`, so the player is told the real
 * reason ("this demo has too few rounds") instead of a generic validation error,
 * and the job is not retried — reparsing cannot create rounds.
 */
export function validateCanonicalMatch(match: CanonicalMatch): void {
  if (match.players.length === 0) throw new PipelineError("VALIDATION_ERROR", "no players");
  if (match.rounds.length === 0) throw new PipelineError("VALIDATION_ERROR", "no rounds");
  if (match.rounds.length < MIN_VALID_ROUNDS) {
    throw new PipelineError(
      "DEMO_INSUFFICIENT_SAMPLE",
      `rounds=${match.rounds.length} < ${MIN_VALID_ROUNDS}`,
    );
  }
  if (!match.events.some((event) => event.type === "kill")) {
    throw new PipelineError("VALIDATION_ERROR", "no kill events");
  }
}

/**
 * Resolves WHICH player in the demo is the signed-in user.
 * Only an explicit, previously stored Steam ID is accepted — the pipeline never
 * guesses a player from a nickname.
 *
 * Kept for callers that legitimately REQUIRE a player (metrics/projection on
 * demand). The ingestion path uses `resolveOwnParticipant` instead, because a
 * missing link is a state of the attachment, never a defect of the match.
 */
export function resolveOwnSteamId(match: CanonicalMatch, steamId: string | null): string {
  const outcome = resolveOwnParticipant(match, steamId);
  if (!outcome.steamId) throw new PipelineError("PLAYER_IDENTITY_UNRESOLVED", outcome.reason ?? undefined);
  return outcome.steamId;
}

/** Why the canonical match could not be attached to this user's player. */
export type PlayerAttachmentReason =
  | "no_player_profile"
  | "no_steam_id_on_profile"
  | "steam_id_not_in_demo";

export interface PlayerAttachmentOutcome {
  /** The proven Steam ID of the signed-in user inside this demo, when present. */
  steamId: string | null;
  reason: PlayerAttachmentReason | null;
  /** Only method accepted today: an explicitly stored, proven Steam ID. */
  method: "steam_id_profile" | null;
  confidence: number | null;
}

/**
 * FASE 2.7.2A — attachment as a RESULT, not an exception.
 *
 * A demo whose participants do not include the user's Steam ID is still a fully
 * valid match: it just has no player projection yet. Nothing here infers a
 * player from a nickname, a team name or a slot index.
 */
export function resolveOwnParticipant(
  match: CanonicalMatch,
  steamId: string | null,
): PlayerAttachmentOutcome {
  if (!steamId) {
    return {
      steamId: null,
      reason: "no_steam_id_on_profile",
      method: null,
      confidence: null,
    };
  }
  const found = match.players.find((player) => player.steamId === steamId);
  if (!found) {
    return { steamId: null, reason: "steam_id_not_in_demo", method: null, confidence: null };
  }
  return { steamId: found.steamId, reason: null, method: "steam_id_profile", confidence: 1 };
}

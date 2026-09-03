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
  if (fileSize < MIN_DEMO_SIZE_BYTES) throw new PipelineError("DEMO_TOO_SMALL");
  if (fileSize > MAX_DEMO_SIZE_BYTES) throw new PipelineError("DEMO_TOO_LARGE");
}

/** Canonical-data sanity check before anything is persisted. */
export function validateCanonicalMatch(match: CanonicalMatch): void {
  if (match.players.length === 0) throw new PipelineError("VALIDATION_ERROR", "no players");
  if (match.rounds.length < MIN_VALID_ROUNDS) {
    throw new PipelineError("VALIDATION_ERROR", `rounds=${match.rounds.length}`);
  }
  if (!match.events.some((event) => event.type === "kill")) {
    throw new PipelineError("VALIDATION_ERROR", "no kill events");
  }
}

/**
 * Resolves WHICH player in the demo is the signed-in user.
 * Only an explicit, previously stored Steam ID is accepted — the pipeline never
 * guesses a player from a nickname.
 */
export function resolveOwnSteamId(match: CanonicalMatch, steamId: string | null): string {
  if (!steamId) throw new PipelineError("PLAYER_IDENTITY_UNRESOLVED", "no steam id on profile");
  const found = match.players.find((player) => player.steamId === steamId);
  if (!found) throw new PipelineError("PLAYER_IDENTITY_UNRESOLVED", "steam id not in demo");
  return found.steamId;
}

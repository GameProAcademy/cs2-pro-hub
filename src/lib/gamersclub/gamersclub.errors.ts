/**
 * Gamers Club — structured error codes.
 *
 * Only codes reachable by the CURRENT implementation exist here. Collector /
 * parser / worker codes are intentionally absent: inventing them would suggest
 * behaviour that does not exist (see `gamersclub.constants.ts`).
 */
export const GAMERS_CLUB_ERROR_CODES = [
  "GAMERS_CLUB_INVALID_URL",
  "GAMERS_CLUB_UNSUPPORTED_HOST",
  "GAMERS_CLUB_INSECURE_URL",
  "GAMERS_CLUB_URL_CREDENTIALS",
  "GAMERS_CLUB_INVALID_PROFILE_PATH",
  /** No permitted, unauthenticated collection path exists today. */
  "GAMERS_CLUB_PUBLIC_DATA_UNAVAILABLE",
  "GAMERS_CLUB_DUPLICATE_ACCOUNT",
] as const;

export type GamersClubErrorCode = (typeof GAMERS_CLUB_ERROR_CODES)[number];

/** None of the current codes are transient: retrying cannot change any of them. */
export function isRetryableGamersClubError(_code: GamersClubErrorCode): boolean {
  return false;
}

export class GamersClubError extends Error {
  readonly code: GamersClubErrorCode;

  constructor(code: GamersClubErrorCode) {
    super(code);
    this.name = "GamersClubError";
    this.code = code;
  }

  get retryable(): boolean {
    return isRetryableGamersClubError(this.code);
  }
}

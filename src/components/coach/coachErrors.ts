import type { TranslationKey } from "@/i18n/config";
import type { CoachErrorCode } from "@/lib/coach.functions";

export const COACH_STATE_KEY = ["coach", "state"] as const;

export function coachErrorKey(code: CoachErrorCode): TranslationKey {
  switch (code) {
    case "COACH_RATE_LIMITED":
      return "real.aicoach.error.rateLimited";
    case "COACH_PROVIDER_RATE_LIMITED":
      return "real.aicoach.error.busy";
    case "COACH_MESSAGE_TOO_LONG":
      return "real.aicoach.error.tooLong";
    case "COACH_CONVERSATION_NOT_FOUND":
      return "real.aicoach.error.conversation";
    case "COACH_NO_DATA":
      return "real.aicoach.noData";
    case "COACH_NO_PLAYER":
    case "COACH_PLAYER_AMBIGUOUS":
      return "real.aicoach.noPlayer";
    // Fase 3.3: a specific, honest message per provider failure class (no internals shown).
    case "COACH_PROVIDER_TIMEOUT":
      return "coach2.error.timeout";
    case "COACH_PROVIDER_NOT_CONFIGURED":
    case "COACH_PROVIDER_AUTH_FAILED":
    case "COACH_PROVIDER_FORBIDDEN":
    case "COACH_PROVIDER_BAD_REQUEST":
      return "coach2.error.providerConfig";
    case "COACH_PROVIDER_NO_CREDITS":
      return "coach2.error.noCredits";
    case "COACH_PROVIDER_MODEL_UNAVAILABLE":
      return "coach2.error.modelUnavailable";
    case "COACH_REQUEST_IN_PROGRESS":
      return "coach2.error.inProgress";
    case "COACH_PERSIST_FAILED":
      return "coach2.error.persist";
    case "COACH_PROVIDER_INVALID_RESPONSE":
    case "COACH_PROVIDER_EMPTY":
    case "COACH_PROVIDER_TRUNCATED":
      return "coach2.error.invalidResponse";
    default:
      return "real.aicoach.error.unavailable";
  }
}

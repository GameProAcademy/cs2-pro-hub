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
    default:
      return "real.aicoach.error.unavailable";
  }
}

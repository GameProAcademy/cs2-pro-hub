import { isUtilityEvent } from "@/lib/pipeline/evidence";
import { resolveAnalyticalParticipant } from "@/lib/pipeline/metrics";
import type {
  CanonicalEvent,
  CanonicalMatch,
  HotAimObservation,
  HotEconomySnapshot,
  HotPositionSnapshot,
  HotSectionQuality,
} from "@/lib/pipeline/types";

export type SemanticAvailability = "complete" | "limited" | "unavailable" | "not_implemented";

export interface PlayerSemanticData {
  participantKey: string;
  eventPlayerKey: string;
  aim: HotAimObservation[];
  position: HotPositionSnapshot[];
  economy: HotEconomySnapshot[];
  utility: CanonicalEvent[];
  availability: {
    aim: SemanticAvailability;
    position: SemanticAvailability;
    economy: SemanticAvailability;
    utility: "available" | "unavailable";
  };
}

function status(quality: HotSectionQuality | undefined): SemanticAvailability {
  return quality?.status ?? "unavailable";
}

/** Selects bounded semantic evidence for exactly one participant. */
export function selectPlayerSemanticData(
  match: CanonicalMatch,
  participantKey: string,
): PlayerSemanticData {
  const target = resolveAnalyticalParticipant(match, participantKey);
  const semantic = match.hotSemanticData;
  const belongsToTarget = (row: { player?: string | undefined }) =>
    row.player === target.eventPlayerKey || row.player === target.participantKey;

  const utility = match.events.filter(
    (event) => isUtilityEvent(event) && event.actorSteamId === target.eventPlayerKey,
  );
  const utilityCoverageAvailable = !match.quality.flags.includes("missing_utility");

  return {
    participantKey: target.participantKey,
    eventPlayerKey: target.eventPlayerKey,
    aim: (semantic?.aim_observations ?? []).filter(belongsToTarget),
    position: (semantic?.position_snapshots ?? []).filter(belongsToTarget),
    economy: (semantic?.economy_snapshots ?? []).filter(belongsToTarget),
    utility,
    availability: {
      aim: status(semantic?.quality.aim_observations),
      position: status(semantic?.quality.position_snapshots),
      economy: status(semantic?.quality.economy_snapshots),
      // Availability describes source coverage. An empty scoped list is a valid
      // zero only when utility coverage exists for the match.
      utility: utilityCoverageAvailable ? "available" : "unavailable",
    },
  };
}
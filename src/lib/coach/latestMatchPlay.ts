/**
 * PM3 — Coach integration of modules C (`cs2.duels.v1`) and D (`cs2.utility.v1`) for the player's
 * most recent match. Pure: it compacts the same reports the /duels and /utility pages render
 * (never recomputed differently) into what the model may quote: value in display units, status,
 * sample and method. Values without a valued status are null (never zero). No player identity,
 * match id, round or tick leaves this module.
 */
import type { CombatReport } from "@/lib/combat/duels";
import { roundHalfUp } from "@/lib/metrics/rounding";
import type { MetricEnvelope, MetricStatus } from "@/lib/metrics/metricContract";
import type { OverviewMatch } from "@/lib/playerOverview";
import type { UtilityReport } from "@/lib/utility/utility";

export const LATEST_MATCH_PLAY_VERSION = "coach-latest-match-play-v1";

const VALUED: readonly MetricStatus[] = ["OBSERVED", "DERIVED", "INFERRED", "PARTIAL"];

export interface CoachPlayMetric {
  metric: string;
  status: MetricStatus;
  /** In `unit`; a ratio is sent as a percentage. null unless the status is a valued one. */
  value: number | null;
  unit: string;
  sample: { n: number; unit: string } | null;
  method: string;
}

export interface LatestMatchPlay {
  version: typeof LATEST_MATCH_PLAY_VERSION;
  map: string | null;
  dateBasis: "played" | "processed";
  combat: {
    version: string;
    duels: { total: number; won: number; lost: number; withoutKill: number };
    shotsRecorded: boolean;
    metrics: CoachPlayMetric[];
    notMeasured: string[];
  } | null;
  utility: {
    version: string;
    blindsRecorded: boolean;
    throwsRecorded: boolean;
    grenades: Array<{
      grenade: string;
      throws: number | null;
      detonations: number | null;
      beforeFirstKill: number | null;
      afterFirstKill: number | null;
      afterPlant: number | null;
    }>;
    metrics: CoachPlayMetric[];
  } | null;
}

export function compactMetric(m: MetricEnvelope, name = m.metric_key): CoachPlayMetric {
  const valued = VALUED.includes(m.status) && m.value !== null;
  const ratio = m.unit === "ratio";
  return {
    metric: name,
    status: m.status,
    value: valued ? roundHalfUp(ratio ? m.value! * 100 : m.value!, ratio ? 1 : 2) : null,
    unit: ratio ? "percent" : m.unit,
    sample: m.sample_size,
    method: m.provenance_method,
  };
}

export function buildLatestMatchPlay(
  match: OverviewMatch,
  combat: { report: CombatReport; shotsAttributed: boolean } | null,
  utility: { report: UtilityReport; blindsRecorded: boolean; throwsAttributed: boolean } | null,
): LatestMatchPlay {
  return {
    version: LATEST_MATCH_PLAY_VERSION,
    map: match.map,
    dateBasis: match.dateSource,
    combat: combat
      ? {
          version: combat.report.version,
          duels: {
            total: combat.report.duels.length,
            won: combat.report.duels.filter((d) => d.outcome === "WON").length,
            lost: combat.report.duels.filter((d) => d.outcome === "LOST").length,
            withoutKill: combat.report.duels.filter((d) => d.outcome === "UNRESOLVED").length,
          },
          shotsRecorded: combat.shotsAttributed,
          metrics: Object.entries(combat.report.metrics)
            .filter(([, m]) => m.status !== "NOT_MEASURED")
            .map(([k, m]) => compactMetric(m, `combat.${k}`)),
          notMeasured: combat.report.notMeasured.map((n) => n.metric_key),
        }
      : null,
    utility: utility
      ? {
          version: utility.report.version,
          blindsRecorded: utility.blindsRecorded,
          throwsRecorded: utility.throwsAttributed,
          grenades: utility.report.grenades.map((g) => ({
            grenade: g.grenade,
            throws: g.throws,
            detonations: g.detonations,
            beforeFirstKill: g.detonations === null ? null : g.phases.before_first_kill,
            afterFirstKill: g.detonations === null ? null : g.phases.after_first_kill,
            afterPlant: g.detonations === null ? null : g.phases.after_plant,
          })),
          metrics: Object.values(utility.report.metrics).map((m) => compactMetric(m)),
        }
      : null,
  };
}

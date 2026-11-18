/**
 * PM3 / 4.2.5 — duels & aim page (module C). Renders `cs2.duels.v1` and nothing else. Every metric
 * shows what it measures, value, sample (N) and status in words; NOT_MEASURED and
 * INSUFFICIENT_SAMPLE never show a number; each duel links to the 2D replay on its first tick.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Info, UserX } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { SaveMomentButton } from "@/components/moments/SaveMoment";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { getMatchCombat, type CombatResponse } from "@/lib/combat.functions";
import { DUEL_GAP_SECONDS, BURST_GAP_SECONDS, type Duel } from "@/lib/combat/duels";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import type { MetricEnvelope } from "@/lib/metrics/metricContract";

export interface CombatSearch {
  matchId?: string | undefined;
}
export const combatQueryKey = (s: CombatSearch) => ["player", "combat", s] as const;

const VALUED = new Set(["OBSERVED", "DERIVED", "INFERRED", "PARTIAL"]);
/** Sample units emitted by cs2.duels.v1, translated for display (the envelope keeps the English). */
const UNIT_KEYS: Record<string, TranslationKey> = {
  "resolved duels": "combat.unit.resolvedDuels",
  "opening duels": "combat.unit.openingDuels",
  "kills with a headshot flag": "combat.unit.kills",
  "kills + deaths in the band": "combat.unit.killsDeaths",
  shots: "combat.unit.shots",
  bursts: "combat.unit.bursts",
  "bullet hits with a hit group": "combat.unit.hits",
};

export function RealCombatPage({
  search,
  onSearch,
}: {
  search: CombatSearch;
  onSearch: (next: CombatSearch) => void;
}) {
  const t = useT();
  const clean = search.matchId ? { matchId: search.matchId } : {};
  const query = useQuery({
    queryKey: combatQueryKey(clean),
    queryFn: () => getMatchCombat({ data: clean }),
  });
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("combat.eyebrow")}
          title={t("combat.title")}
          description={t("combat.description")}
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <CombatBody r={query.data} onSearch={onSearch} />
        )}
      </div>
    </AppShell>
  );
}

/** Ratio envelope as a percentage; anything without a value is a state, never 0. */
export function MetricTile({ m, label }: { m: MetricEnvelope; label: string }) {
  const t = useT();
  const { intlTag } = useI18n();
  const valued = VALUED.has(m.status) && m.value !== null;
  return (
    <div
      className="rounded-md border border-border bg-card p-4"
      data-metric={m.metric_key}
      data-metric-status={m.status}
      data-provenance-method={m.provenance_method}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
        {valued ? `${formatNumber(m.value! * 100, intlTag, 1)}%` : NOT_AVAILABLE_MARK}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(`combat.status.${m.status}` as TranslationKey)}
        {m.sample_size
          ? ` · ${fill(t("combat.sample"), {
              n: m.sample_size.n,
              unit: UNIT_KEYS[m.sample_size.unit]
                ? t(UNIT_KEYS[m.sample_size.unit]!)
                : m.sample_size.unit,
            })}`
          : ""}
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">{t("combat.method")}</summary>
        <p className="mt-1 leading-relaxed">
          {t(`combat.methodText.${m.metric_key.split(".")[0]}` as TranslationKey)}
        </p>
      </details>
    </div>
  );
}

function Rate({ m }: { m: MetricEnvelope }) {
  const t = useT();
  const { intlTag } = useI18n();
  return (
    <span data-metric-status={m.status}>
      {VALUED.has(m.status) && m.value !== null
        ? `${formatNumber(m.value * 100, intlTag, 1)}%`
        : t(`combat.status.${m.status}` as TranslationKey)}
    </span>
  );
}

export function CombatBody({
  r,
  onSearch,
}: {
  r: CombatResponse;
  onSearch: (next: CombatSearch) => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  if (r.status === "EMPTY")
    return (
      <div data-combat-status="EMPTY">
        <EmptyState
          icon={<CircleDashed className="size-5" aria-hidden />}
          title={t("combat.empty.title")}
          description={t("combat.empty.description")}
        />
      </div>
    );
  const current = r.status === "OK" || r.status === "NO_PARTICIPANT" ? r.matchId : "";
  return (
    <div className="space-y-6" data-combat-status={r.status}>
      <label className="flex max-w-md flex-col gap-1 text-xs text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.12em]">{t("combat.filter.match")}</span>
        <select
          name="match"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={current}
          onChange={(e) => onSearch({ matchId: e.target.value || undefined })}
        >
          {current ? null : <option value="">{NOT_AVAILABLE_MARK}</option>}
          {r.matches.map((m) => (
            <option key={m.matchId} value={m.matchId}>
              {`${formatDate(m.playedAt, intlTag)} · ${m.map ? mapDisplayName(m.map) : NOT_AVAILABLE_MARK}`}
            </option>
          ))}
        </select>
      </label>
      {r.status === "NOT_FOUND" ? (
        <EmptyState
          icon={<UserX className="size-5" aria-hidden />}
          title={t("combat.notFound.title")}
          description={t("combat.notFound.description")}
        />
      ) : r.status === "NO_PARTICIPANT" ? (
        <EmptyState
          icon={<UserX className="size-5" aria-hidden />}
          title={t("combat.noParticipant.title")}
          description={t("combat.noParticipant.description")}
        />
      ) : (
        <CombatReportView r={r} />
      )}
    </div>
  );
}

function CombatReportView({ r }: { r: Extract<CombatResponse, { status: "OK" }> }) {
  const t = useT();
  const { intlTag } = useI18n();
  const rep = r.report;
  const m = rep.metrics;
  return (
    <div className="space-y-6">
      {!r.telemetry.shotsAttributed ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          data-telemetry="LEGACY"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("combat.legacyTelemetry")}
        </p>
      ) : null}
      <ChartCard
        title={t("combat.section.duels")}
        subtitle={fill(t("combat.section.duels.subtitle"), { gap: DUEL_GAP_SECONDS })}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricTile m={m["duel_win_rate"]!} label={t("combat.metric.duel_win_rate")} />
          <MetricTile
            m={m["opening_duel_win_rate"]!}
            label={t("combat.metric.opening_duel_win_rate")}
          />
          <MetricTile m={m["headshot_kill_rate"]!} label={t("combat.metric.headshot_kill_rate")} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground" data-duel-counts>
          {fill(t("combat.duelCounts"), {
            total: rep.duels.length,
            won: rep.duels.filter((d) => d.outcome === "WON").length,
            lost: rep.duels.filter((d) => d.outcome === "LOST").length,
            unresolved: rep.duels.filter((d) => d.outcome === "UNRESOLVED").length,
          })}
        </p>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t("combat.section.weaponClass")}
          subtitle={t("combat.section.weaponClass.subtitle")}
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">{t("combat.col.class")}</th>
                <th className="py-1 font-medium">{t("combat.col.wonLost")}</th>
                <th className="py-1 font-medium">{t("combat.col.rate")}</th>
              </tr>
            </thead>
            <tbody>
              {rep.byWeaponClass.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-2 text-muted-foreground">
                    {t("combat.none")}
                  </td>
                </tr>
              ) : (
                rep.byWeaponClass.map((c) => (
                  <tr key={c.cls} className="border-t border-border">
                    <td className="py-1">{t(`combat.class.${c.cls}` as TranslationKey)}</td>
                    <td className="py-1 font-mono">{`${c.won} / ${c.lost}`}</td>
                    <td className="py-1 font-mono">
                      <Rate m={c.metric} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard
          title={t("combat.section.distance")}
          subtitle={t("combat.section.distance.subtitle")}
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">{t("combat.col.band")}</th>
                <th className="py-1 font-medium">{t("combat.col.killsDeaths")}</th>
                <th className="py-1 font-medium">{t("combat.col.killShare")}</th>
              </tr>
            </thead>
            <tbody>
              {rep.byDistance.map((b) => (
                <tr key={b.band} className="border-t border-border">
                  <td className="py-1">{t(`combat.band.${b.band}` as TranslationKey)}</td>
                  <td className="py-1 font-mono">{`${b.kills} / ${b.deaths}`}</td>
                  <td className="py-1 font-mono">
                    <Rate m={b.metric} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>

      <ChartCard
        title={t("combat.section.shooting")}
        subtitle={fill(t("combat.section.shooting.subtitle"), { gap: BURST_GAP_SECONDS })}
      >
        <div className="grid gap-3 sm:grid-cols-3" data-shooting-status={rep.shooting.status}>
          <MetricTile m={m["shot_hit_rate"]!} label={t("combat.metric.shot_hit_rate")} />
          <MetricTile
            m={m["first_shot_hit_rate"]!}
            label={t("combat.metric.first_shot_hit_rate")}
          />
          <MetricTile m={m["head_hit_share"]!} label={t("combat.metric.head_hit_share")} />
        </div>
        {rep.shooting.status === "MEASURED" ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <table className="w-full text-sm">
              <caption className="pb-1 text-left text-xs font-medium text-muted-foreground">
                {t("combat.byWeapon")}
              </caption>
              <tbody>
                {rep.shooting.byWeapon.slice(0, 8).map((w) => (
                  <tr key={w.weapon} className="border-t border-border">
                    <td className="py-1">{w.weapon}</td>
                    <td className="py-1 font-mono">{`${w.hits} / ${w.shots}`}</td>
                    <td className="py-1 font-mono">
                      <Rate m={w.metric} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-sm">
              <caption className="pb-1 text-left text-xs font-medium text-muted-foreground">
                {t("combat.spray")}
              </caption>
              <tbody>
                {rep.shooting.spray.map((s) => (
                  <tr key={s.bucket} className="border-t border-border">
                    <td className="py-1">{fill(t("combat.spray.bullet"), { n: s.bucket })}</td>
                    <td className="py-1 font-mono">{`${s.hits} / ${s.shots}`}</td>
                    <td className="py-1 font-mono">
                      <Rate m={s.metric} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-sm">
              <caption className="pb-1 text-left text-xs font-medium text-muted-foreground">
                {t("combat.hitGroups")}
              </caption>
              <tbody>
                {rep.shooting.hitGroups.map((h) => (
                  <tr key={h.group} className="border-t border-border">
                    <td className="py-1">{t(`combat.hitGroup.${h.group}` as TranslationKey)}</td>
                    <td className="py-1 font-mono">{h.hits}</td>
                    <td className="py-1 font-mono">
                      <Rate m={h.metric} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t("combat.sprayNote")}
        </p>
      </ChartCard>

      <ChartCard
        title={t("combat.section.notMeasured")}
        subtitle={t("combat.section.notMeasured.subtitle")}
      >
        <ul className="space-y-2 text-sm" data-not-measured>
          {rep.notMeasured.map((n) => (
            <li key={n.metric_key} data-metric={n.metric_key} data-metric-status="NOT_MEASURED">
              <span className="font-medium text-foreground">
                {t(`combat.metric.${n.metric_key}` as TranslationKey)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                — {t(`combat.needs.${n.metric_key}` as TranslationKey)}
              </span>
            </li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard title={t("combat.section.list")} subtitle={t("combat.section.list.subtitle")}>
        {rep.duels.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("combat.noDuels")}</p>
        ) : (
          <table className="w-full text-sm" data-duel-list>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">{t("combat.col.round")}</th>
                <th className="py-1 font-medium">{t("combat.col.outcome")}</th>
                <th className="py-1 font-medium">{t("combat.col.weapon")}</th>
                <th className="py-1 font-medium">{t("combat.col.distance")}</th>
                <th className="py-1 font-medium">{t("combat.col.damage")}</th>
                <th className="py-1 font-medium">
                  <span className="sr-only">{t("combat.col.replay")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rep.duels.map((d) => (
                <DuelRow
                  key={`${d.ref.round}:${d.ref.tick}:${d.endTick}`}
                  d={d}
                  matchId={r.matchId}
                  intlTag={intlTag}
                />
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>
    </div>
  );
}

function DuelRow({ d, matchId, intlTag }: { d: Duel; matchId: string; intlTag: string }) {
  const t = useT();
  return (
    <tr
      className="border-t border-border"
      data-duel-outcome={d.outcome}
      data-duel-opening={d.opening ? "true" : "false"}
    >
      <td className="py-1 font-mono">{d.ref.round}</td>
      <td className="py-1">
        {t(`combat.outcome.${d.outcome}` as TranslationKey)}
        {d.opening ? ` · ${t("combat.opening")}` : ""}
      </td>
      <td className="py-1">{d.weapon ?? NOT_AVAILABLE_MARK}</td>
      <td className="py-1 font-mono">
        {d.distanceMeters === null
          ? NOT_AVAILABLE_MARK
          : `${formatNumber(d.distanceMeters, intlTag, 1)} m`}
      </td>
      <td className="py-1 font-mono">{`${formatNumber(d.damageDealt, intlTag)} / ${formatNumber(d.damageTaken, intlTag)}`}</td>
      <td className="py-1 text-right">
        <Link
          to="/replay"
          search={{ matchId, round: d.ref.round, tick: d.ref.tick }}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          data-replay-link
        >
          {t("combat.openReplay")}
        </Link>
        <SaveMomentButton
          compact
          matchId={matchId}
          round={d.ref.round}
          tick={d.ref.tick}
          kind={d.opening ? "OPENING" : d.outcome === "WON" ? "KILL" : "DEATH"}
          source="DUELS"
          defaultTitle={`${fill(t("rounds.roundN"), { n: d.ref.round })} · ${t(`combat.outcome.${d.outcome}` as TranslationKey)}`}
        />
      </td>
    </tr>
  );
}

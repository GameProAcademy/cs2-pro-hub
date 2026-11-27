/**
 * PM3 / 4.2.6 — utility page (module D). Renders `cs2.utility.v1` and nothing else. Every metric
 * shows value, sample (N) and status in words; NOT_OBSERVED / NOT_MEASURED / INSUFFICIENT_SAMPLE
 * never show a number; each flash links to the 2D replay on its detonation tick. A flash with no
 * enemy blinded is described as "no measured effect", never as a wasted or bad flash.
 */
import { GameIcon } from "@/components/common/GameIcon";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Info, UserX } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { GrenadeLabel } from "@/components/common/GameVisuals";
import { SaveMomentButton } from "@/components/moments/SaveMoment";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { MatchSelectSlot, MaybePageHeader, MaybeShell } from "@/components/real/MatchScope";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import type { MetricEnvelope } from "@/lib/metrics/metricContract";
import { DataStateText } from "@/components/common/DataState";
import { getMatchUtility, type UtilityResponse } from "@/lib/utility.functions";
import { PHASES, type FlashRow } from "@/lib/utility/utility";

export interface UtilitySearch {
  matchId?: string | undefined;
}
export const utilityQueryKey = (s: UtilitySearch) => ["player", "utility", s] as const;

const VALUED = new Set(["OBSERVED", "DERIVED", "INFERRED", "PARTIAL"]);
const SAMPLE_UNIT: Record<string, TranslationKey> = {
  flashes: "nade.unit.flashes",
  grenades: "nade.unit.grenades",
};

export function RealUtilityPage({
  search,
  onSearch,
}: {
  search: UtilitySearch;
  onSearch: (next: UtilitySearch) => void;
}) {
  const t = useT();
  const clean = search.matchId ? { matchId: search.matchId } : {};
  const query = useQuery({
    queryKey: utilityQueryKey(clean),
    queryFn: () => getMatchUtility({ data: clean }),
  });
  return (
    <MaybeShell>
      <div className="space-y-6">
        <MaybePageHeader
          eyebrow={t("nade.eyebrow")}
          title={t("nade.title")}
          description={t("nade.description")}
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
          <UtilityBody r={query.data} onSearch={onSearch} />
        )}
      </div>
    </MaybeShell>
  );
}

function display(m: MetricEnvelope, intlTag: string): string {
  if (!VALUED.has(m.status) || m.value === null) return NOT_AVAILABLE_MARK;
  if (m.unit === "ratio") return `${formatNumber(m.value * 100, intlTag, 1)}%`;
  if (m.unit === "seconds") return `${formatNumber(m.value, intlTag, 2)} s`;
  if (m.unit === "hp") return `${formatNumber(m.value, intlTag, 1)} HP`;
  if (m.unit === "players") return formatNumber(m.value, intlTag, m.value % 1 ? 2 : 0);
  return formatNumber(m.value, intlTag);
}

function Tile({ m }: { m: MetricEnvelope }) {
  const t = useT();
  const { intlTag } = useI18n();
  const key = m.metric_key.split(".")[1]!;
  return (
    <div
      className="surface-panel rounded-lg border border-border p-4"
      data-metric={m.metric_key}
      data-metric-status={m.status}
      data-provenance-method={m.provenance_method}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <GameIcon name="grenade" className="size-3.5 text-category-utility" />
        {t(`nade.metric.${key}` as TranslationKey)}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{display(m, intlTag)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <DataStateText status={m.status} coverage={m.coverage} />
        {m.sample_size
          ? ` · ${fill(t("combat.sample"), {
              n: m.sample_size.n,
              unit: SAMPLE_UNIT[m.sample_size.unit]
                ? t(SAMPLE_UNIT[m.sample_size.unit]!)
                : m.sample_size.unit,
            })}`
          : ""}
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">{t("combat.method")}</summary>
        <p className="mt-1 leading-relaxed">{t(`nade.methodText.${key}` as TranslationKey)}</p>
      </details>
    </div>
  );
}

function Note({ id, children }: { id: string; children: string }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
      data-telemetry={id}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function UtilityBody({
  r,
  onSearch,
}: {
  r: UtilityResponse;
  onSearch: (next: UtilitySearch) => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  if (r.status === "EMPTY")
    return (
      <div data-utility-status="EMPTY">
        <EmptyState
          icon={<CircleDashed className="size-5" aria-hidden />}
          title={t("combat.empty.title")}
          description={t("nade.empty.description")}
        />
      </div>
    );
  const current = r.status === "OK" || r.status === "NO_PARTICIPANT" ? r.matchId : "";
  return (
    <div className="space-y-6" data-utility-status={r.status}>
      <MatchSelectSlot>
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
      </MatchSelectSlot>
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
          description={t("nade.noParticipant.description")}
        />
      ) : (
        <UtilityReportView r={r} />
      )}
    </div>
  );
}

function UtilityReportView({ r }: { r: Extract<UtilityResponse, { status: "OK" }> }) {
  const t = useT();
  const rep = r.report;
  const m = rep.metrics;
  const tel = r.telemetry;
  const count = (v: number | null) => (v === null ? NOT_AVAILABLE_MARK : String(v));
  return (
    <div className="space-y-6">
      {!tel.detonationsAttributed ? <Note id="NO_THROWER">{t("nade.note.noThrower")}</Note> : null}
      {!tel.blindsRecorded ? <Note id="NO_BLINDS">{t("nade.note.noBlinds")}</Note> : null}
      {!tel.throwsAttributed ? <Note id="LEGACY">{t("nade.note.legacy")}</Note> : null}

      <ChartCard
        title={t("nade.section.grenades")}
        subtitle={t("nade.section.grenades.subtitle")}
        icon="grenade"
      >
        <div className="overflow-x-auto" data-table-scroll>
          <table className="w-full text-sm" data-grenades>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">{t("nade.col.grenade")}</th>
                <th className="py-1 font-medium">{t("nade.col.throws")}</th>
                <th className="py-1 font-medium">{t("nade.col.detonations")}</th>
                {PHASES.map((p) => (
                  <th key={p} className="py-1 font-medium">
                    {t(`nade.phase.${p}` as TranslationKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rep.grenades.map((g) => (
                <tr
                  key={g.grenade}
                  className="border-t border-border"
                  data-grenade={g.grenade}
                  data-throws={g.throws === null ? "NOT_OBSERVED" : String(g.throws)}
                  data-detonations={g.detonations === null ? "NOT_OBSERVED" : String(g.detonations)}
                >
                  <td className="py-1">
                    <GrenadeLabel grenade={g.grenade} />
                  </td>
                  <td className="py-1 font-mono">{count(g.throws)}</td>
                  <td className="py-1 font-mono">{count(g.detonations)}</td>
                  {PHASES.map((p) => (
                    <td key={p} className="py-1 font-mono">
                      {g.detonations === null ? NOT_AVAILABLE_MARK : g.phases[p]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("nade.phaseNote")}</p>
      </ChartCard>

      <ChartCard
        title={t("nade.section.flash")}
        subtitle={t("nade.section.flash.subtitle")}
        icon="flash"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile m={m["utility.flashes_detonated"]!} />
          <Tile m={m["utility.flash_effective_rate"]!} />
          <Tile m={m["utility.enemies_blinded_per_flash"]!} />
          <Tile m={m["utility.enemy_blind_seconds_per_flash"]!} />
          <Tile m={m["utility.teammates_blinded"]!} />
          <Tile m={m["utility.self_blinded"]!} />
          <Tile m={m["utility.flash_assist"]!} />
        </div>
      </ChartCard>

      <ChartCard
        title={t("nade.section.damage")}
        subtitle={t("nade.section.damage.subtitle")}
        icon="fire"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile m={m["utility.he_damage_per_grenade"]!} />
          <Tile m={m["utility.fire_damage_per_grenade"]!} />
          <Tile m={m["utility.team_damage"]!} />
          <Tile m={m["utility.kills"]!} />
        </div>
      </ChartCard>

      <ChartCard title={t("nade.section.list")} subtitle={t("nade.section.list.subtitle")}>
        {!tel.blindsRecorded || !tel.detonationsAttributed ? (
          <p className="text-sm text-muted-foreground" data-flash-list="NOT_OBSERVED">
            {t("nade.list.notObserved")}
          </p>
        ) : rep.flashes.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-flash-list="EMPTY">
            {t("nade.list.none")}
          </p>
        ) : (
          <div className="overflow-x-auto" data-table-scroll>
            <table className="w-full text-sm" data-flash-list="OK">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">{t("combat.col.round")}</th>
                  <th className="py-1 font-medium">{t("nade.col.phase")}</th>
                  <th className="py-1 font-medium">{t("nade.col.enemies")}</th>
                  <th className="py-1 font-medium">{t("nade.col.teammates")}</th>
                  <th className="py-1 font-medium">{t("nade.col.blindSeconds")}</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">{t("combat.col.replay")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rep.flashes.map((f) => (
                  <FlashRowView key={f.id} f={f} matchId={r.matchId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function FlashRowView({ f, matchId }: { f: FlashRow; matchId: string }) {
  const t = useT();
  const { intlTag } = useI18n();
  return (
    <tr className="border-t border-border" data-flash-enemies={f.enemies}>
      <td className="py-1 font-mono">{f.round}</td>
      <td className="py-1">
        {f.phase ? t(`nade.phase.${f.phase}` as TranslationKey) : NOT_AVAILABLE_MARK}
      </td>
      <td className="py-1 font-mono">
        {f.enemies > 0 ? f.enemies : <span className="font-sans">{t("nade.noEffect")}</span>}
      </td>
      <td className="py-1 font-mono">
        {f.teammates}
        {f.self ? ` · ${t("nade.self")}` : ""}
      </td>
      <td className="py-1 font-mono">
        {f.enemies > 0 ? `${formatNumber(f.enemyBlindSeconds, intlTag, 2)} s` : NOT_AVAILABLE_MARK}
      </td>
      <td className="py-1 text-right">
        <Link
          to="/replay"
          search={{ matchId, round: f.round, tick: f.tick }}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          data-replay-link
        >
          {t("combat.openReplay")}
        </Link>
        <SaveMomentButton
          compact
          matchId={matchId}
          round={f.round}
          tick={f.tick}
          kind="UTILITY"
          source="UTILITY"
          defaultTitle={`${fill(t("rounds.roundN"), { n: f.round })} · Flash`}
        />
      </td>
    </tr>
  );
}

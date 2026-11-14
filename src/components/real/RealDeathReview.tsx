/**
 * PM2 / 4.2.3 — death review page. Renders `cs2.death-context.v1` + `cs2.death-rules.v1` and
 * nothing else. Every death has four sections — what the demo recorded, calculated context, rule
 * signals, and what is not measured or not supported — with the provenance of each value. No
 * certainty percentage is ever shown; absence is a state, never a zero; positions are drawn only
 * on a VALIDATED map.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Crosshair, MapPinned, UserX } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import {
  getDeathPatterns,
  getMatchDeathReview,
  submitDeathFeedback,
  FEEDBACK_VERDICTS,
  WHOLE_REVIEW,
  type DeathReviewItem,
  type DeathReviewResponse,
  type FeedbackVerdict,
} from "@/lib/diagnosis.functions";
import type { DeathContext, Field } from "@/lib/diagnosis/deathContext";
import { DEATH_RULES, PATTERN_POLICY } from "@/lib/diagnosis/deathRules";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import { RADAR_SIZE } from "@/lib/spatial/maps";
import { radarAsset } from "@/lib/spatial/radarAssets";

export interface DeathReviewSearch {
  matchId?: string | undefined;
}

export const deathReviewQueryKey = (s: DeathReviewSearch) => ["player", "deaths", s] as const;

const SPECIAL_KINDS = new Set<DeathContext["kind"]>([
  "TEAM_KILL",
  "SELF_KILL",
  "WORLD_KILL",
  "UNKNOWN_ATTACKER",
  "UNCLASSIFIED",
]);
const ruleKey = new Map(DEATH_RULES.map((r) => [r.id, r.i18nKey]));

export function RealDeathReviewPage({
  search,
  onSearch,
}: {
  search: DeathReviewSearch;
  onSearch: (next: DeathReviewSearch) => void;
}) {
  const t = useT();
  const clean = search.matchId ? { matchId: search.matchId } : {};
  const query = useQuery({
    queryKey: deathReviewQueryKey(clean),
    queryFn: () => getMatchDeathReview({ data: clean }),
  });
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("diagnosis.eyebrow")}
          title={t("diagnosis.title")}
          description={t("diagnosis.description")}
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
          <DeathReviewBody r={query.data} onSearch={onSearch} />
        )}
        <DeathPatterns />
      </div>
    </AppShell>
  );
}

export function DeathReviewBody({
  r,
  onSearch,
}: {
  r: DeathReviewResponse;
  onSearch: (next: DeathReviewSearch) => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  if (r.status === "EMPTY")
    return (
      <EmptyState
        icon={<CircleDashed className="size-5" aria-hidden />}
        title={t("diagnosis.empty.title")}
        description={t("diagnosis.empty.description")}
      />
    );
  const current = r.status === "OK" || r.status === "NO_PARTICIPANT" ? r.matchId : "";
  return (
    <div className="space-y-6" data-death-review-status={r.status}>
      <label className="flex max-w-md flex-col gap-1 text-xs text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.12em]">{t("diagnosis.filter.match")}</span>
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
          title={t("diagnosis.notFound.title")}
          description={t("diagnosis.notFound.description")}
        />
      ) : r.status === "NO_PARTICIPANT" ? (
        <EmptyState
          icon={<UserX className="size-5" aria-hidden />}
          title={t("diagnosis.noParticipant.title")}
          description={t("diagnosis.noParticipant.description")}
        />
      ) : (
        <>
          <p
            className="text-sm text-muted-foreground"
            data-integrity={r.integrity?.status ?? "PRE_CONTRACT"}
          >
            {r.integrity
              ? fill(
                  t(`diagnosis.integrity.${r.integrity.endedBy ?? "NORMAL"}` as TranslationKey),
                  {
                    n: r.integrity.validRounds,
                  },
                )
              : t("diagnosis.integrity.pre")}
          </p>
          {r.deaths.length === 0 ? (
            <EmptyState
              icon={<Crosshair className="size-5" aria-hidden />}
              title={t("diagnosis.noDeaths")}
            />
          ) : (
            <ol className="space-y-4">
              {r.deaths.map((d) => (
                <li key={d.context.ref.eventId}>
                  <DeathSheet d={d} map={r.map} matchId={r.matchId} support={r.mapSupport} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function useValue() {
  const t = useT();
  const { intlTag } = useI18n();
  return (f: Field<string | number | boolean>, unit = "") => {
    if (f.value === null) return t("diagnosis.notMeasured");
    if (typeof f.value === "boolean") return f.value ? t("diagnosis.yes") : t("diagnosis.no");
    if (typeof f.value === "number") return `${formatNumber(f.value, intlTag, 1)}${unit}`;
    return f.value;
  };
}

function Row({ label, field, text }: { label: string; field: Field<unknown>; text: string }) {
  const t = useT();
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground" data-provenance={field.provenance}>
        {text}{" "}
        <span className="ml-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {t(`diagnosis.provenance.${field.provenance}` as TranslationKey)}
        </span>
      </dd>
    </div>
  );
}

export function DeathSheet({
  d,
  map,
  matchId,
  support,
}: {
  d: DeathReviewItem;
  map: string | null;
  matchId: string;
  support: "SUPPORTED" | "NOT_VALIDATED" | "UNKNOWN_MAP";
}) {
  const t = useT();
  const value = useValue();
  const c = d.context;
  const special = SPECIAL_KINDS.has(c.kind);
  const heading =
    c.ref.roundNumber === null
      ? t("diagnosis.death.roundUnknown")
      : fill(t("diagnosis.death.heading"), {
          round: c.ref.roundNumber,
          tick: c.ref.tick ?? NOT_AVAILABLE_MARK,
        });
  return (
    <ChartCard
      title={heading}
      subtitle={t(`diagnosis.kind.${c.kind}` as TranslationKey)}
      showDemoTag={false}
      actions={
        map ? (
          <Link
            to="/maps"
            search={{ map, matchId, layer: "DEATHS" }}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("diagnosis.link.heatmap")}
          </Link>
        ) : null
      }
    >
      <div
        id={`death-${c.ref.eventId}`}
        className="grid gap-5 lg:grid-cols-2"
        data-death-kind={c.kind}
      >
        <section aria-labelledby={`facts-${c.ref.eventId}`}>
          <h3
            id={`facts-${c.ref.eventId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
          >
            {t("diagnosis.section.facts")}
          </h3>
          <dl>
            <Row
              label={t("diagnosis.fact.weapon")}
              field={c.facts.weapon}
              text={value(c.facts.weapon)}
            />
            <Row
              label={t("diagnosis.fact.headshot")}
              field={c.facts.headshot}
              text={value(c.facts.headshot)}
            />
            <Row
              label={t("diagnosis.fact.distance")}
              field={c.facts.distance}
              text={value(c.facts.distance, " m")}
            />
            <Row
              label={t("diagnosis.fact.blind")}
              field={c.facts.blind}
              text={value(c.facts.blind)}
            />
            <Row
              label={t("diagnosis.fact.wallbang")}
              field={c.facts.wallbang}
              text={value(c.facts.wallbang)}
            />
          </dl>
        </section>
        <section aria-labelledby={`derived-${c.ref.eventId}`}>
          <h3
            id={`derived-${c.ref.eventId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
          >
            {t("diagnosis.section.derived")}
          </h3>
          {!c.round.valid ? (
            <p className="text-sm text-muted-foreground">{t("diagnosis.round.invalid")}</p>
          ) : (
            <dl>
              <Row
                label={t("diagnosis.derived.alive")}
                field={c.alive.teammates}
                text={
                  c.alive.teammates.value === null || c.alive.enemies.value === null
                    ? t("diagnosis.notMeasured")
                    : fill(t("diagnosis.derived.aliveValue"), {
                        own: c.alive.teammates.value,
                        opp: c.alive.enemies.value,
                      })
                }
              />
              <Row
                label={t("diagnosis.derived.trade")}
                field={{
                  value: c.trade.status,
                  provenance: c.trade.status === "NOT_MEASURED" ? "NOT_MEASURED" : "DERIVED",
                }}
                text={fill(t(`diagnosis.trade.${c.trade.status}` as TranslationKey), {
                  s: c.trade.windowSeconds,
                })}
              />
              <Row
                label={t("diagnosis.derived.opening")}
                field={c.round.openingDeath}
                text={value(c.round.openingDeath)}
              />
              <Row
                label={t("diagnosis.derived.postPlant")}
                field={c.round.bombPlantedBeforeDeath}
                text={value(c.round.bombPlantedBeforeDeath)}
              />
              <Row
                label={t("diagnosis.derived.roundResult")}
                field={c.round.won}
                text={
                  c.round.won.value === null
                    ? t("diagnosis.notMeasured")
                    : c.round.won.value
                      ? t("diagnosis.round.won")
                      : t("diagnosis.round.lost")
                }
              />
            </dl>
          )}
        </section>
        <section aria-labelledby={`rules-${c.ref.eventId}`}>
          <h3
            id={`rules-${c.ref.eventId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
          >
            {t("diagnosis.section.rules")}
          </h3>
          {special ? (
            <p className="text-sm text-muted-foreground">{t("diagnosis.kind.special")}</p>
          ) : (
            <ul className="space-y-2">
              {d.rules
                .filter((r) => r.outcome !== "NOT_SUPPORTED")
                .map((r) => (
                  <li
                    key={r.ruleId}
                    data-rule={r.ruleId}
                    data-outcome={r.outcome}
                    className="text-sm"
                  >
                    <span className="font-medium text-foreground">
                      {t(`${ruleKey.get(r.ruleId)}.title` as TranslationKey)}
                    </span>
                    {" · "}
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      {t(`diagnosis.outcome.${r.outcome}` as TranslationKey)}
                    </span>
                    {r.outcome === "MATCH" ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {fill(t(`${ruleKey.get(r.ruleId)}.body` as TranslationKey), {
                          s: c.trade.windowSeconds,
                        })}
                      </p>
                    ) : null}
                    {r.outcome === "MATCH" ? (
                      <FeedbackControl
                        matchId={matchId}
                        eventId={c.ref.eventId}
                        ruleId={r.ruleId}
                        current={d.feedback[r.ruleId]}
                        label={t("diagnosis.feedback.rule")}
                      />
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
        </section>
        <section aria-labelledby={`unknown-${c.ref.eventId}`}>
          <h3
            id={`unknown-${c.ref.eventId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
          >
            {t("diagnosis.section.unknown")}
          </h3>
          <p className="text-xs font-medium text-foreground">{t("diagnosis.missing.title")}</p>
          <p className="mb-2 text-sm text-muted-foreground" data-missing={c.missing.join(",")}>
            {c.missing.length
              ? c.missing.map((m) => t(`diagnosis.missing.${m}` as TranslationKey)).join(" · ")
              : t("diagnosis.missing.none")}
          </p>
          <ul className="space-y-1">
            {d.rules
              .filter((r) => r.outcome === "NOT_SUPPORTED")
              .map((r) => (
                <li
                  key={r.ruleId}
                  className="text-xs leading-relaxed text-muted-foreground"
                  data-rule={r.ruleId}
                >
                  <span className="font-medium text-foreground">
                    {t(`${ruleKey.get(r.ruleId)}.title` as TranslationKey)}
                  </span>
                  {": "}
                  {t(`${ruleKey.get(r.ruleId)}.body` as TranslationKey)}
                </li>
              ))}
          </ul>
        </section>
        <section className="lg:col-span-2" aria-labelledby={`pos-${c.ref.eventId}`}>
          <h3
            id={`pos-${c.ref.eventId}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
          >
            {t("diagnosis.position.title")}
          </h3>
          {support !== "SUPPORTED" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinned className="size-4" aria-hidden />
              {t("diagnosis.position.notValidated")}
            </p>
          ) : !d.radar?.victim ? (
            <p className="text-sm text-muted-foreground">{t("diagnosis.position.missing")}</p>
          ) : (
            <DeathRadar d={d} map={map} />
          )}
        </section>
        <div className="lg:col-span-2">
          <FeedbackControl
            matchId={matchId}
            eventId={c.ref.eventId}
            ruleId={WHOLE_REVIEW}
            current={d.feedback[WHOLE_REVIEW]}
            label={t("diagnosis.feedback.review")}
          />
        </div>
      </div>
    </ChartCard>
  );
}

/**
 * The player's own opinion on a death or a rule signal. Stored apart from the diagnosis
 * (death_feedback, owner RLS); it never changes a rule outcome.
 */
export function FeedbackControl({
  matchId,
  eventId,
  ruleId,
  current,
  label,
}: {
  matchId: string;
  eventId: string;
  ruleId: string;
  current: FeedbackVerdict | undefined;
  label: string;
}) {
  const t = useT();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (verdict: FeedbackVerdict) =>
      submitDeathFeedback({ data: { matchId, roundEventId: eventId, ruleId, verdict } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["player", "deaths"] }),
  });
  const chosen = mutation.isPending ? mutation.variables : current;
  const status = mutation.isError
    ? t("diagnosis.feedback.failed")
    : mutation.data?.status === "REFUSED"
      ? t("diagnosis.feedback.refused")
      : mutation.data?.status === "SAVED"
        ? t("diagnosis.feedback.saved")
        : "";
  return (
    <div className="mt-1.5" data-feedback={ruleId} data-feedback-current={current ?? ""}>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {FEEDBACK_VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={chosen === v}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(v)}
            className={
              chosen === v
                ? "rounded border border-primary bg-primary/15 px-2 py-0.5 text-xs text-foreground"
                : "rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            {t(`diagnosis.feedback.${v}` as TranslationKey)}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function DeathRadar({ d, map }: { d: DeathReviewItem; map: string | null }) {
  const t = useT();
  const victim = d.radar?.victim;
  const attacker = d.radar?.attacker ?? null;
  if (!victim || !map) return null;
  const background = radarAsset(map, victim.level);
  return (
    <figure className="max-w-[320px]">
      <svg
        viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
        className="aspect-square w-full rounded-md border border-border bg-secondary/40"
        role="img"
        data-death-radar
        aria-label={`${mapDisplayName(map)} · ${t("diagnosis.position.title")}`}
      >
        {background ? (
          <image
            href={background.src}
            x={0}
            y={0}
            width={RADAR_SIZE}
            height={RADAR_SIZE}
            preserveAspectRatio="none"
          />
        ) : null}
        {attacker ? (
          <line
            x1={attacker.x}
            y1={attacker.y}
            x2={victim.x}
            y2={victim.y}
            className="stroke-muted-foreground"
            strokeWidth={3}
            strokeDasharray="10 8"
          />
        ) : null}
        {attacker ? (
          <circle
            cx={attacker.x}
            cy={attacker.y}
            r={12}
            className="fill-primary"
            stroke="black"
            strokeWidth={2}
          />
        ) : null}
        <circle
          cx={victim.x}
          cy={victim.y}
          r={14}
          className="fill-destructive"
          stroke="black"
          strokeWidth={2}
        />
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full bg-destructive" aria-hidden />
          {t("diagnosis.position.you")}
        </span>
        {attacker ? (
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-primary" aria-hidden />
            {t("diagnosis.position.attacker")}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

function DeathPatterns() {
  const t = useT();
  const { intlTag } = useI18n();
  const query = useQuery({
    queryKey: ["player", "deaths", "patterns"],
    queryFn: () => getDeathPatterns(),
  });
  if (query.isPending || query.isError || !query.data) return null;
  const p = query.data;
  return (
    <ChartCard
      title={t("diagnosis.patterns.title")}
      subtitle={
        p.period
          ? fill(t("diagnosis.patterns.sample"), {
              deaths: p.deaths,
              matches: p.matches,
              from: formatDate(p.period.from, intlTag),
              to: formatDate(p.period.to, intlTag),
            })
          : t("diagnosis.patterns.empty")
      }
      showDemoTag={false}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {fill(t("diagnosis.patterns.policy"), { ...PATTERN_POLICY })}
      </p>
      <ul className="space-y-2">
        {p.patterns
          .filter((x) => x.status !== "NOT_SUPPORTED")
          .map((x) => (
            <li key={x.ruleId} data-pattern={x.ruleId} data-status={x.status} className="text-sm">
              <span className="font-medium text-foreground">
                {t(`${ruleKey.get(x.ruleId)}.title` as TranslationKey)}
              </span>
              {" · "}
              <span className="font-mono text-xs uppercase text-muted-foreground">
                {t(`diagnosis.patterns.status.${x.status}` as TranslationKey)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {fill(t("diagnosis.patterns.count"), {
                  n: x.occurrences,
                  total: x.evaluatedDeaths,
                  matches: x.matches,
                })}
              </span>
            </li>
          ))}
      </ul>
    </ChartCard>
  );
}

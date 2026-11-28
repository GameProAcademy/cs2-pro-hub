/**
 * PM4 / 4.2.7 — round review (modules E/F). Renders `cs2.rounds.v1` + `cs2.economy.v1` only.
 * Team facts and the player's own facts are separate sections; every rate is shown as
 * "numerator of denominator" with its N, and an empty denominator is "no eligible rounds", never
 * 0 %. Unknown buys are never shown as eco. Each round and each event opens the 2D replay.
 */
import { SideBadge, ToneBadge } from "@/components/common/VisualBadges";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Info, UserX } from "lucide-react";
import type { ReactNode } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { GameIcon } from "@/components/common/GameIcon";
import { HudIcon, SideLogo } from "@/components/cs2/Cs2Art";
import { KillFeedLine } from "@/components/cs2/MatchTimeline";
import { RoundFocus } from "@/components/cs2/RoundFocus";
import { cn } from "@/lib/utils";

import { SaveMomentButton } from "@/components/moments/SaveMoment";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { MatchSelectSlot, MaybePageHeader, MaybeShell } from "@/components/real/MatchScope";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { NOT_AVAILABLE_MARK, fill, formatDate, formatNumber } from "@/lib/format";
import { getMatchRounds, type RoundsResponse } from "@/lib/rounds.functions";
import { BUY_CATEGORIES, ECONOMY_SOURCE, type BuyLabel } from "@/lib/rounds/economy";
import type { Rate, RoundReport } from "@/lib/rounds/roundImpact";

export interface RoundsSearch {
  matchId?: string | undefined;
}
export const roundsQueryKey = (s: RoundsSearch) => ["player", "rounds", s] as const;

export function RealRoundsPage({
  search,
  onSearch,
}: {
  search: RoundsSearch;
  onSearch: (next: RoundsSearch) => void;
}) {
  const t = useT();
  const clean = search.matchId ? { matchId: search.matchId } : {};
  const query = useQuery({
    queryKey: roundsQueryKey(clean),
    queryFn: () => getMatchRounds({ data: clean }),
  });
  return (
    <MaybeShell>
      <div className="space-y-6">
        <MaybePageHeader
          eyebrow={t("rounds.eyebrow")}
          title={t("rounds.title")}
          description={t("rounds.description")}
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
          <RoundsBody r={query.data} onSearch={onSearch} />
        )}
      </div>
    </MaybeShell>
  );
}

/** "3 de 5 (60 %)" — or "no eligible rounds" when the denominator is 0. Never 0 % by default. */
export function RateText({ r, k }: { r: Rate; k: string }) {
  const t = useT();
  const { intlTag } = useI18n();
  if (r.denominator === 0)
    return (
      <span data-rate={k} data-rate-status="NO_SAMPLE" className="text-muted-foreground">
        {t("rounds.noEligible")}
      </span>
    );
  return (
    <span data-rate={k} data-rate-status="OK" className="font-mono">
      {fill(t("rounds.rateOf"), {
        n: r.numerator,
        d: r.denominator,
        p: formatNumber((r.numerator / r.denominator) * 100, intlTag, 0),
      })}
    </span>
  );
}

function buyText(t: ReturnType<typeof useT>, label: BuyLabel | undefined) {
  if (!label) return NOT_AVAILABLE_MARK;
  if (label.status === "UNKNOWN") return t(`rounds.unknown.${label.reason}` as TranslationKey);
  return t(`rounds.buy.${label.category}` as TranslationKey) + (label.scaled ? " *" : "");
}

function Note({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
      data-rounds-note={id}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function RoundsBody({
  r,
  onSearch,
}: {
  r: RoundsResponse;
  onSearch: (next: RoundsSearch) => void;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  if (r.status === "EMPTY")
    return (
      <div data-rounds-status="EMPTY">
        <EmptyState
          icon={<CircleDashed className="size-5" aria-hidden />}
          title={t("combat.empty.title")}
          description={t("rounds.empty.description")}
        />
      </div>
    );
  const current = r.status === "OK" || r.status === "NO_PARTICIPANT" ? r.matchId : "";
  return (
    <div className="space-y-6" data-rounds-status={r.status}>
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
          description={t("rounds.noParticipant.description")}
        />
      ) : (
        <RoundsReportView r={r} />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-1.5 text-sm first:border-t-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function RoundsReportView({ r }: { r: Extract<RoundsResponse, { status: "OK" }> }) {
  const t = useT();
  const { intlTag } = useI18n();
  const s = r.summary;
  const m = s.me;
  const perRound = (v: number) =>
    m.playedRounds ? formatNumber(v / m.playedRounds, intlTag, 1) : NOT_AVAILABLE_MARK;
  const excluded = r.rounds.filter((x) => !x.valid || !x.side);
  return (
    <div className="space-y-6">
      <RoundFocus
        rounds={r.rounds}
        matchId={r.matchId}
        map={r.map}
        describe={(e, side) => eventText(t, e, side)}
      />

      <Note id="COVERAGE">
        {fill(t("rounds.coverage"), { used: m.playedRounds, total: s.rounds })}
        {excluded.length
          ? ` ${t("rounds.excluded")} ${excluded
              .map((x) =>
                fill(t("rounds.excludedItem"), {
                  n: x.roundNumber,
                  why: t(`rounds.invalid.${x.invalidReason ?? "NO_SIDE"}` as TranslationKey),
                }),
              )
              .join("; ")}.`
          : ""}
      </Note>
      {!r.spendRecorded ? <Note id="NO_SPEND">{t("rounds.note.noSpend")}</Note> : null}
      {s.disconnectRounds ? (
        <Note id="DISCONNECT">{fill(t("rounds.note.disconnect"), { n: s.disconnectRounds })}</Note>
      ) : null}

      <ChartCard title={t("rounds.section.list")} subtitle={t("rounds.section.list.subtitle")}>
        <ol className="flex flex-col gap-2" data-round-list>
          {r.rounds.map((round) => (
            <RoundItem key={round.roundNumber} round={round} matchId={r.matchId} />
          ))}
        </ol>
      </ChartCard>

      <ChartCard title={t("rounds.section.team")} subtitle={t("rounds.section.team.subtitle")}>
        <div data-rounds-section="team" className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("rounds.byBuy")}
            </h3>
            {BUY_CATEGORIES.filter((c) => s.team.byBuy[c]).map((c) => (
              <Row key={c} label={t(`rounds.buy.${c}` as TranslationKey)}>
                <RateText r={s.team.byBuy[c]!} k={`buy.${c}`} />
              </Row>
            ))}
            {s.team.unknownBuyRounds ? (
              <Row label={t("rounds.unknownBuyRounds")}>
                <span className="font-mono">{s.team.unknownBuyRounds}</span>
              </Row>
            ) : null}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {fill(t("rounds.buyMethod"), { source: ECONOMY_SOURCE })}
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("rounds.situations")}
            </h3>
            <Row label={t("rounds.team.openingWon")}>
              <RateText r={s.team.openingWon} k="openingWon" />
            </Row>
            <Row label={t("rounds.team.openingLost")}>
              <RateText r={s.team.openingLost} k="openingLost" />
            </Row>
            <Row label={t("rounds.team.advantageHeld")}>
              <RateText r={s.team.advantageHeld} k="advantageHeld" />
            </Row>
            <Row label={t("rounds.team.fromDisadvantage")}>
              <RateText r={s.team.fromDisadvantage} k="fromDisadvantage" />
            </Row>
            <Row label={t("rounds.team.retakeCt")}>
              <RateText r={s.team.retakeCt} k="retakeCt" />
            </Row>
            <Row label={t("rounds.team.postPlantT")}>
              <RateText r={s.team.postPlantT} k="postPlantT" />
            </Row>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("rounds.teamNotCausal")}
            </p>
          </div>
        </div>
      </ChartCard>

      <ChartCard title={t("rounds.section.me")} subtitle={t("rounds.section.me.subtitle")}>
        <div data-rounds-section="me" className="grid gap-6 lg:grid-cols-2">
          <div>
            <Row label={t("rounds.me.kda")}>
              <span className="font-mono">{`${m.kills} / ${m.deaths} / ${m.assists}`}</span>
            </Row>
            <Row label={t("rounds.me.adr")}>
              <span className="font-mono">{perRound(m.damage)}</span>
              {m.damagePartialRounds > 0 ? (
                <span className="block text-xs text-warning" data-adr-partial="true">
                  {fill(t("adr.partialRounds"), { n: m.damagePartialRounds })}
                </span>
              ) : null}
            </Row>
            <Row label={t("rounds.me.opening")}>
              <span className="font-mono" data-rate="opening">
                {fill(t("rounds.me.openingValue"), {
                  k: m.openingKills,
                  d: m.openingDeaths,
                  n: m.openingRounds,
                })}
              </span>
            </Row>
            <Row label={t("rounds.me.tradeKills")}>
              <span className="font-mono">{m.tradeKills}</span>
            </Row>
            <Row label={t("rounds.me.deathsTraded")}>
              <RateText r={m.deathsTraded} k="deathsTraded" />
            </Row>
            <Row label={t("rounds.me.survival")}>
              <RateText r={m.survival} k="survival" />
            </Row>
            <Row label={t("rounds.me.objective")}>
              <span className="font-mono">
                {fill(t("rounds.me.objectiveValue"), { p: m.plants, d: m.defuses })}
              </span>
            </Row>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("rounds.me.clutches")}
            </h3>
            {Object.keys(m.clutches).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rounds.me.noClutch")}</p>
            ) : (
              Object.entries(m.clutches)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([size, rate]) => (
                  <Row key={size} label={size}>
                    <RateText r={rate} k={`clutch.${size}`} />
                  </Row>
                ))
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("rounds.me.clutchNote")}
            </p>
            <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("rounds.me.byOwnBuy")}
            </h3>
            {BUY_CATEGORIES.filter((c) => m.byOwnBuy[c]).map((c) => {
              const b = m.byOwnBuy[c]!;
              return (
                <Row key={c} label={t(`rounds.buy.${c}` as TranslationKey)}>
                  <span className="font-mono" data-own-buy={c}>
                    {fill(t("rounds.me.byOwnBuyValue"), {
                      r: b.rounds,
                      k: b.kills,
                      d: b.deaths,
                      adr: formatNumber(b.damage / b.rounds, intlTag, 0),
                    })}
                  </span>
                </Row>
              );
            })}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

function RoundItem({ round, matchId }: { round: RoundReport; matchId: string }) {
  const t = useT();
  const side = round.side;
  const own = side ? round.economy.teams[side]?.label : undefined;
  const enemy = side ? round.economy.teams[side === "T" ? "CT" : "T"]?.label : undefined;
  const result =
    round.won === null ? NOT_AVAILABLE_MARK : t(round.won ? "rounds.won" : "rounds.lost");
  return (
    <li
      className={cn(
        "vgl-rise rounded-lg border border-border border-l-4 bg-card/60 px-3 py-2.5",
        side === "CT"
          ? "border-l-side-ct"
          : side === "T"
            ? "border-l-side-t"
            : "border-l-border-strong",
        round.won === true && "bg-primary/[0.04]",
      )}
      data-round={round.roundNumber}
      data-round-valid={round.valid ? "true" : "false"}
      data-round-won={round.won === null ? "UNKNOWN" : String(round.won)}
      data-buy={own?.status === "CLASSIFIED" ? own.category : "UNKNOWN"}
    >
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span
            className="flex h-9 min-w-9 items-center justify-center rounded-md border border-border-strong bg-elevated px-1.5 font-mono text-sm font-semibold tabular-nums text-foreground"
            aria-hidden
          >
            {round.roundNumber}
          </span>
          <span className="sr-only">{fill(t("rounds.roundN"), { n: round.roundNumber })}</span>
          {side ? (
            <span className="inline-flex items-center gap-1.5">
              <SideLogo side={side} className="size-6" />
              <SideBadge side={side} />
            </span>
          ) : (
            <span className="text-muted-foreground">{NOT_AVAILABLE_MARK}</span>
          )}
          {round.won === null ? (
            <span className="text-muted-foreground">{result}</span>
          ) : (
            <ToneBadge tone={round.won ? "brand" : "critical"}>{result}</ToneBadge>
          )}
          <span className="text-muted-foreground">
            {`${buyText(t, own)} × ${buyText(t, enemy)}`}
          </span>
          {round.me ? (
            <span
              className="inline-flex items-center gap-2 font-mono text-muted-foreground"
              data-round-me
            >
              <span className="inline-flex items-center gap-1">
                <GameIcon name="kill" className="size-3.5 text-primary" />
                {`${round.me.kills}K`}
              </span>
              <span className="inline-flex items-center gap-1">
                <HudIcon name="icon_skull_default" className="size-3.5" />
                {`${round.me.deaths}D`}
              </span>
            </span>
          ) : null}
          {round.opening.status === "OK" && (round.opening.byMe || round.opening.onMe) ? (
            <ToneBadge tone={round.opening.byMe ? "brand" : "attention"} icon="crosshair">
              {t(round.opening.byMe ? "rounds.tag.openingKill" : "rounds.tag.openingDeath")}
            </ToneBadge>
          ) : null}
          {round.clutch ? (
            <ToneBadge tone="context" icon="target" data-clutch={`1v${round.clutch.opponents}`}>
              {`1v${round.clutch.opponents}`}
            </ToneBadge>
          ) : null}
          {round.overtime ? <ToneBadge tone="neutral">OT</ToneBadge> : null}
          {!round.valid ? (
            <span className="text-xs text-muted-foreground">
              {t(`rounds.invalid.${round.invalidReason ?? "NO_SIDE"}` as TranslationKey)}
            </span>
          ) : null}
        </summary>
        <div className="mt-2 space-y-2 pl-2 text-sm">
          {round.economy.player ? (
            <p className="text-xs text-muted-foreground" data-player-buy>
              {fill(t("rounds.myEconomy"), {
                buy: buyText(t, round.economy.player.label),
                start: round.economy.player.moneyStart ?? NOT_AVAILABLE_MARK,
                spent: round.economy.player.moneySpent ?? NOT_AVAILABLE_MARK,
              })}
              {side && round.economy.teams[side]?.mixed ? ` · ${t("rounds.mixed")}` : ""}
            </p>
          ) : null}
          <ol className="space-y-1" data-timeline>
            {round.timeline.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-xs" data-feed-item>
                <KillFeedLine e={e} mySide={side} sentence={eventText(t, e, side)} index={i} />
                <span className="font-mono text-muted-foreground max-sm:hidden">{e.tick}</span>
                {e.alive ? (
                  <span className="font-mono text-muted-foreground">{`T ${e.alive.T} × CT ${e.alive.CT}`}</span>
                ) : null}
                <Link
                  to="/replay"
                  search={{ matchId, round: round.roundNumber, tick: e.tick }}
                  className="text-primary underline-offset-2 hover:underline"
                  data-replay-link
                >
                  {t("combat.openReplay")}
                </Link>
                {e.byMe || e.onMe || e.type !== "kill" ? (
                  <SaveMomentButton
                    compact
                    matchId={matchId}
                    round={round.roundNumber}
                    tick={e.tick}
                    kind={
                      e.type === "bomb_plant"
                        ? "PLANT"
                        : e.type === "bomb_defuse"
                          ? "DEFUSE"
                          : e.type === "kill"
                            ? e.onMe
                              ? "DEATH"
                              : "KILL"
                            : "ROUND"
                    }
                    source="ROUNDS"
                    defaultTitle={`${fill(t("rounds.roundN"), { n: round.roundNumber })} · ${eventText(t, e, side)}`}
                  />
                ) : null}
              </li>
            ))}
            {round.timeline.length === 0 ? (
              <li className="text-xs text-muted-foreground">{t("rounds.noEvents")}</li>
            ) : null}
          </ol>
        </div>
      </details>
    </li>
  );
}

function eventText(
  t: ReturnType<typeof useT>,
  e: RoundReport["timeline"][number],
  mySide: string | null,
): string {
  const who = (side: string | null, me: boolean) =>
    me
      ? t("rounds.who.me")
      : !side
        ? t("rounds.who.unknown")
        : side === mySide
          ? t("rounds.who.team")
          : t("rounds.who.enemy");
  if (e.type !== "kill")
    return fill(t(`rounds.event.${e.type}` as TranslationKey), { who: who(e.side, e.byMe) });
  if (e.kind === "WORLD" || e.kind === "SELF")
    return fill(t(`rounds.event.${e.kind.toLowerCase()}` as TranslationKey), {
      victim: who(e.victimSide, e.onMe),
    });
  return fill(t("rounds.event.kill"), {
    who: who(e.side, e.byMe),
    victim: who(e.victimSide, e.onMe),
    weapon: e.weapon ?? NOT_AVAILABLE_MARK,
  });
}

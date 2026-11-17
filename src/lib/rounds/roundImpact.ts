/**
 * PM4 — Fase 4.2.7, módulo F: `cs2.rounds.v1` (round state and individual contribution), pure.
 *
 * Unit of analysis: the ROUND. Team facts (result, numbers advantage, conversion, buy) are kept
 * apart from the player's own facts (kills, opening, trades, clutch, survival, objective).
 * Nothing here is causal: a won round with an advantage is described, not attributed.
 *
 * Definitions (v1), reusing the rules already validated in the product:
 *   - round validity: the round exists in match_rounds with start and end ticks, both sides have a
 *     roster (round_players.side) and every kill of the round has a tick and a known victim side.
 *     A round where a participant DISCONNECTED (R5.8.31 round_end.data.disconnected) is valid for
 *     result/objective but its alive counts are NOT_MEASURED (a BOT may take the slot);
 *   - opening (as `openingDuels` in the pipeline): the round's first death with a UNIQUE earliest
 *     tick; a tie => AMBIGUOUS. Opening kill only when it is an ENEMY kill; a team/self/world first
 *     death is an opening death without an opening kill;
 *   - trade: TRADE_WINDOW_SECONDS (src/config/pipeline.ts, 5 s, same as round_players.traded and
 *     the death review): a teammate of the victim kills the killer within the window, same round;
 *   - alive counts: roster per side minus deaths up to and including the tick (deaths on one tick
 *     are applied together); counts never go below zero — a victim outside the roster invalidates;
 *   - advantage (team): a state where own alive > enemy alive; converted = the round was won after
 *     holding it; won from disadvantage = won after own alive < enemy alive at some point;
 *   - clutch (as `clutchStats`): the player becomes the last alive of the team with >= 1 enemy
 *     alive => 1vN with N at that instant; won = round won AND player survived (pipeline rule);
 *   - post-plant: a bomb_plant with a tick; alive counts at the plant tick; for CT it is a retake
 *     situation, for T a post-plant defence; outcome = round result and win reason;
 *   - plant/defuse: bomb_plant / bomb_defuse events with the actor (OBSERVED);
 *   - survival: rostered, not killed, round valid and not disconnected; otherwise excluded.
 */
import { TRADE_WINDOW_SECONDS } from "@/config/pipeline";
import { WORLD_WEAPONS, type RoundPlayerRow, type Side } from "@/lib/diagnosis/deathContext";
import { classifyRoundEconomy, type RoundEconomy } from "@/lib/rounds/economy";

export const ROUNDS_VERSION = "cs2.rounds.v1";

export interface RoundInfo {
  roundNumber: number;
  startTick: number | null;
  endTick: number | null;
  winnerSide: Side | null;
  winReason: string | null;
}

export interface RoundKill {
  id: string;
  roundNumber: number | null;
  tick: number | null;
  timeSeconds: number | null;
  actor: string | null;
  victim: string | null;
  assister: string | null;
  weapon: string | null;
  headshot: boolean | null;
}

export interface RoundDamage {
  roundNumber: number | null;
  actor: string | null;
  victim: string | null;
  damage: number | null;
}

export interface RoundObjective {
  roundNumber: number | null;
  tick: number | null;
  type: "bomb_plant" | "bomb_defuse" | "bomb_explode";
  actor: string | null;
}

export interface RoundEndFacts {
  roundNumber: number;
  moneySpent: Record<string, number> | null;
  disconnected: Record<string, number> | null;
}

export interface RoundEconomyRow {
  roundNumber: number;
  participantKey: string;
  moneyStart: number | null;
  equipmentStart: number | null;
}

export interface RoundsInput {
  matchId: string;
  rounds: RoundInfo[];
  roundPlayers: (RoundPlayerRow & RoundEconomyRow)[];
  kills: RoundKill[];
  /** The caller's own damage rows only. */
  damage: RoundDamage[];
  objectives: RoundObjective[];
  roundEnds: RoundEndFacts[];
}

export type KillKind = "ENEMY" | "TEAM" | "SELF" | "WORLD" | "UNKNOWN";

export interface TimelineItem {
  tick: number;
  type: "kill" | "bomb_plant" | "bomb_defuse" | "bomb_explode";
  /** Side of the killer / the planter / the defuser; null = world or unknown. */
  side: Side | null;
  victimSide: Side | null;
  kind: KillKind | null;
  /** The caller is the actor / the victim (no other identity is exposed). */
  byMe: boolean;
  onMe: boolean;
  weapon: string | null;
  headshot: boolean | null;
  traded: boolean | null;
  alive: { T: number; CT: number } | null;
}

export interface RoundReport {
  roundNumber: number;
  valid: boolean;
  invalidReason: "ROUND_BOUNDARY" | "ROSTER" | "KILL_DATA" | null;
  overtime: boolean;
  side: Side | null;
  won: boolean | null;
  winReason: string | null;
  disconnect: boolean;
  economy: RoundEconomy;
  opening: {
    status: "OK" | "AMBIGUOUS" | "NO_DEATH" | "NOT_MEASURED";
    teamWon: boolean | null;
    kind: KillKind | null;
    byMe: boolean;
    onMe: boolean;
    tick: number | null;
  };
  advantage: {
    status: "OK" | "NOT_MEASURED";
    held: boolean | null;
    disadvantage: boolean | null;
  };
  clutch: { opponents: number; won: boolean; tick: number } | null;
  postPlant: {
    tick: number;
    plantedBy: "ME" | "TEAM" | "ENEMY" | "UNKNOWN";
    alive: { own: number; enemy: number } | null;
    defused: boolean;
    exploded: boolean;
  } | null;
  me: {
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    headshotKills: number;
    tradeKills: number;
    deathTraded: boolean | null;
    survived: boolean | null;
    planted: boolean;
    defused: boolean;
  } | null;
  timeline: TimelineItem[];
}

const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

function kindOf(k: RoundKill, sides: Map<string, Side | null>): KillKind {
  if (!k.actor) return k.weapon && WORLD_WEAPONS.has(k.weapon) ? "WORLD" : "UNKNOWN";
  if (k.actor === k.victim) return "SELF";
  const a = sides.get(k.actor) ?? null;
  const v = k.victim ? (sides.get(k.victim) ?? null) : null;
  if (!a || !v) return "UNKNOWN";
  return a === v ? "TEAM" : "ENEMY";
}

const other = (s: Side): Side => (s === "T" ? "CT" : "T");

export function buildRoundReports(input: RoundsInput, me: string): RoundReport[] {
  const spendByRound = new Map(input.roundEnds.map((r) => [r.roundNumber, r]));
  const maxRound = Math.max(0, ...input.rounds.map((r) => r.roundNumber));
  // Regulation is MR12 in CS2 Premier/FACEIT/GC; rounds beyond 24 are overtime (label only).
  const overtimeFrom = maxRound > 24 ? 25 : Infinity;
  return [...input.rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((round) =>
      buildRound(input, round, me, spendByRound.get(round.roundNumber), overtimeFrom),
    );
}

function buildRound(
  input: RoundsInput,
  round: RoundInfo,
  me: string,
  end: RoundEndFacts | undefined,
  overtimeFrom: number,
): RoundReport {
  const n = round.roundNumber;
  const roster = input.roundPlayers.filter((p) => p.roundNumber === n);
  const sides = new Map(roster.map((p) => [p.participantKey, p.side]));
  const mySide = sides.get(me) ?? null;
  const disconnected = new Set(Object.keys(end?.disconnected ?? {}));
  const economy = classifyRoundEconomy(
    {
      roundNumber: n,
      spendRecorded: !!end?.moneySpent,
      players: roster.map((p) => ({
        participantKey: p.participantKey,
        side: p.side,
        moneyStart: p.moneyStart,
        equipmentStart: p.equipmentStart,
        moneySpent: end?.moneySpent?.[p.participantKey] ?? null,
      })),
    },
    me,
  );
  const kills = input.kills
    .filter((k) => k.roundNumber === n)
    .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || a.id.localeCompare(b.id));
  const objectives = input.objectives
    .filter((o) => o.roundNumber === n)
    .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

  const boundary = finite(round.startTick) && finite(round.endTick);
  const rosterOk =
    roster.some((p) => p.side === "T") &&
    roster.some((p) => p.side === "CT") &&
    roster.every((p) => p.side === "T" || p.side === "CT");
  const killDataOk = kills.every(
    (k) =>
      finite(k.tick) && (!k.victim || sides.get(k.victim) === "T" || sides.get(k.victim) === "CT"),
  );
  const invalidReason = !boundary
    ? "ROUND_BOUNDARY"
    : !rosterOk
      ? "ROSTER"
      : !killDataOk
        ? "KILL_DATA"
        : null;
  const valid = invalidReason === null;
  const won = round.winnerSide && mySide ? round.winnerSide === mySide : null;
  const countable = valid && disconnected.size === 0;

  // Alive counts after each tick group.
  const aliveAfter = new Map<number, { T: number; CT: number }>();
  let advantageHeld: boolean | null = null;
  let disadvantage: boolean | null = null;
  let clutch: RoundReport["clutch"] = null;
  if (countable) {
    const alive = {
      T: roster.filter((p) => p.side === "T").length,
      CT: roster.filter((p) => p.side === "CT").length,
    };
    const dead = new Set<string>();
    advantageHeld = false;
    disadvantage = false;
    if (mySide) {
      // A round can start unbalanced (a player absent from the roster): the initial state counts.
      if (alive[mySide] > alive[other(mySide)]) advantageHeld = true;
      if (alive[mySide] < alive[other(mySide)]) disadvantage = true;
    }
    const ticks = [...new Set(kills.map((k) => k.tick as number))];
    for (const tick of ticks) {
      for (const k of kills.filter((x) => x.tick === tick)) {
        if (!k.victim || dead.has(k.victim)) continue;
        dead.add(k.victim);
        const s = sides.get(k.victim) as Side;
        alive[s] = Math.max(0, alive[s] - 1);
      }
      aliveAfter.set(tick, { ...alive });
      if (mySide) {
        const own = alive[mySide];
        const enemy = alive[other(mySide)];
        if (own > enemy && enemy > 0) advantageHeld = true;
        if (own < enemy && own > 0) disadvantage = true;
        if (!clutch && own === 1 && !dead.has(me) && enemy >= 1) {
          const mates = roster.filter((p) => p.side === mySide && p.participantKey !== me);
          if (mates.every((p) => dead.has(p.participantKey)))
            clutch = { opponents: enemy, won: false, tick };
        }
      }
    }
  }

  // Opening.
  let opening: RoundReport["opening"] = {
    status: "NOT_MEASURED",
    teamWon: null,
    kind: null,
    byMe: false,
    onMe: false,
    tick: null,
  };
  if (valid) {
    const first = kills[0];
    if (!first) opening = { ...opening, status: "NO_DEATH" };
    else if (kills.filter((k) => k.tick === first.tick).length > 1)
      opening = { ...opening, status: "AMBIGUOUS", tick: first.tick };
    else {
      const kind = kindOf(first, sides);
      const killerSide = kind === "ENEMY" && first.actor ? (sides.get(first.actor) ?? null) : null;
      opening = {
        status: "OK",
        kind,
        tick: first.tick,
        byMe: kind === "ENEMY" && first.actor === me,
        onMe: first.victim === me,
        teamWon: killerSide && mySide ? killerSide === mySide : null,
      };
    }
  }

  // Trades (window shared with the pipeline).
  const tradedDeath = (death: RoundKill): boolean | null => {
    if (kindOf(death, sides) !== "ENEMY" || !finite(death.timeSeconds) || !death.victim)
      return null;
    const vSide = sides.get(death.victim);
    return kills.some(
      (k) =>
        k.victim === death.actor &&
        k.actor !== null &&
        sides.get(k.actor) === vSide &&
        finite(k.timeSeconds) &&
        k.timeSeconds >= (death.timeSeconds as number) &&
        k.timeSeconds - (death.timeSeconds as number) <= TRADE_WINDOW_SECONDS,
    );
  };

  // Post-plant.
  const plant = objectives.find((o) => o.type === "bomb_plant" && finite(o.tick));
  let postPlant: RoundReport["postPlant"] = null;
  if (valid && plant && mySide) {
    const before = [...aliveAfter.entries()].filter(([t]) => t <= (plant.tick as number)).pop();
    const start = {
      T: roster.filter((p) => p.side === "T").length,
      CT: roster.filter((p) => p.side === "CT").length,
    };
    const state = countable ? (before ? before[1] : start) : null;
    const planterSide = plant.actor ? (sides.get(plant.actor) ?? null) : null;
    postPlant = {
      tick: plant.tick as number,
      plantedBy:
        plant.actor === me
          ? "ME"
          : !planterSide
            ? "UNKNOWN"
            : planterSide === mySide
              ? "TEAM"
              : "ENEMY",
      alive: state ? { own: state[mySide], enemy: state[other(mySide)] } : null,
      defused: objectives.some((o) => o.type === "bomb_defuse"),
      exploded: objectives.some((o) => o.type === "bomb_explode"),
    };
  }

  // The player's own facts.
  let mine: RoundReport["me"] = null;
  if (mySide) {
    const myKills = kills.filter((k) => k.actor === me && kindOf(k, sides) === "ENEMY");
    const myDeath = kills.find((k) => k.victim === me) ?? null;
    const survived = !valid || disconnected.has(me) ? null : !myDeath;
    mine = {
      kills: myKills.length,
      deaths: myDeath ? 1 : 0,
      assists: kills.filter((k) => k.assister === me && kindOf(k, sides) === "ENEMY").length,
      damage: input.damage
        .filter(
          (d) =>
            d.roundNumber === n &&
            d.actor === me &&
            d.victim &&
            finite(d.damage) &&
            sides.get(d.victim) &&
            sides.get(d.victim) !== mySide,
        )
        .reduce((s, d) => s + (d.damage as number), 0),
      headshotKills: myKills.filter((k) => k.headshot === true).length,
      tradeKills: myKills.filter((k) =>
        kills.some(
          (d) =>
            d.actor === k.victim &&
            d.victim &&
            d.victim !== me &&
            sides.get(d.victim) === mySide &&
            kindOf(d, sides) === "ENEMY" &&
            finite(d.timeSeconds) &&
            finite(k.timeSeconds) &&
            (k.timeSeconds as number) >= (d.timeSeconds as number) &&
            (k.timeSeconds as number) - (d.timeSeconds as number) <= TRADE_WINDOW_SECONDS,
        ),
      ).length,
      deathTraded: myDeath ? tradedDeath(myDeath) : null,
      survived,
      planted: objectives.some((o) => o.type === "bomb_plant" && o.actor === me),
      defused: objectives.some((o) => o.type === "bomb_defuse" && o.actor === me),
    };
  }
  if (clutch && won !== null && mine) clutch = { ...clutch, won: won && mine.survived === true };

  const timeline: TimelineItem[] = [
    ...kills
      .filter((k) => finite(k.tick))
      .map((k): TimelineItem => {
        const kind = kindOf(k, sides);
        return {
          tick: k.tick as number,
          type: "kill",
          side: k.actor ? (sides.get(k.actor) ?? null) : null,
          victimSide: k.victim ? (sides.get(k.victim) ?? null) : null,
          kind,
          byMe: k.actor === me,
          onMe: k.victim === me,
          weapon: k.weapon,
          headshot: k.headshot,
          traded: tradedDeath(k),
          alive: aliveAfter.get(k.tick as number) ?? null,
        };
      }),
    ...objectives
      .filter((o) => finite(o.tick))
      .map((o): TimelineItem => ({
        tick: o.tick as number,
        type: o.type,
        side: o.actor ? (sides.get(o.actor) ?? null) : null,
        victimSide: null,
        kind: null,
        byMe: o.actor === me,
        onMe: false,
        weapon: null,
        headshot: null,
        traded: null,
        alive: null,
      })),
  ].sort((a, b) => a.tick - b.tick);

  return {
    roundNumber: n,
    valid,
    invalidReason,
    overtime: n >= overtimeFrom,
    side: mySide,
    won,
    winReason: round.winReason,
    disconnect: disconnected.size > 0,
    economy,
    opening,
    advantage: countable
      ? { status: "OK", held: advantageHeld, disadvantage }
      : { status: "NOT_MEASURED", held: null, disadvantage: null },
    clutch,
    postPlant,
    me: mine,
    timeline,
  };
}

// ---------------------------------------------------------------------------------------------
// Summary: team facts and the player's own facts, each with its own N (rounds where measurable).
// ---------------------------------------------------------------------------------------------
export interface Rate {
  numerator: number;
  denominator: number;
}
const rate = (numerator: number, denominator: number): Rate => ({ numerator, denominator });

export interface RoundsSummary {
  version: typeof ROUNDS_VERSION;
  rounds: number;
  validRounds: number;
  disconnectRounds: number;
  spendRecordedRounds: number;
  team: {
    /** Rounds won by the team per own team buy (CLASSIFIED only). */
    byBuy: Partial<Record<string, Rate>>;
    /** Own buy × enemy buy (CLASSIFIED both). */
    byMatchup: Partial<Record<string, Rate>>;
    unknownBuyRounds: number;
    openingWon: Rate;
    openingLost: Rate;
    advantageHeld: Rate;
    fromDisadvantage: Rate;
    retakeCt: Rate;
    postPlantT: Rate;
  };
  me: {
    openingKills: number;
    openingDeaths: number;
    openingRounds: number;
    tradeKills: number;
    deathsTraded: Rate;
    clutches: Record<string, Rate>;
    survival: Rate;
    plants: number;
    defuses: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    headshotKills: number;
    playedRounds: number;
    /** The player's own buy band -> rounds, kills, deaths, damage. */
    byOwnBuy: Partial<
      Record<string, { rounds: number; kills: number; deaths: number; damage: number }>
    >;
  };
}

export function summarizeRounds(reports: RoundReport[]): RoundsSummary {
  const t = {
    byBuy: {} as Record<string, Rate>,
    byMatchup: {} as Record<string, Rate>,
    unknownBuyRounds: 0,
    openingWon: rate(0, 0),
    openingLost: rate(0, 0),
    advantageHeld: rate(0, 0),
    fromDisadvantage: rate(0, 0),
    retakeCt: rate(0, 0),
    postPlantT: rate(0, 0),
  };
  const m = {
    openingKills: 0,
    openingDeaths: 0,
    openingRounds: 0,
    tradeKills: 0,
    deathsTraded: rate(0, 0),
    clutches: {} as Record<string, Rate>,
    survival: rate(0, 0),
    plants: 0,
    defuses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    headshotKills: 0,
    playedRounds: 0,
    byOwnBuy: {} as Record<
      string,
      { rounds: number; kills: number; deaths: number; damage: number }
    >,
  };
  const add = (r: Rate, won: boolean) => {
    r.denominator += 1;
    if (won) r.numerator += 1;
  };
  for (const r of reports) {
    if (!r.valid || !r.side || r.won === null || !r.me) continue;
    const won = r.won;
    const own = r.economy.teams[r.side]?.label;
    const enemy = r.economy.teams[r.side === "T" ? "CT" : "T"]?.label;
    if (own?.status === "CLASSIFIED") {
      add((t.byBuy[own.category] ??= rate(0, 0)), won);
      if (enemy?.status === "CLASSIFIED")
        add((t.byMatchup[`${own.category}|${enemy.category}`] ??= rate(0, 0)), won);
    } else t.unknownBuyRounds += 1;
    if (r.opening.status === "OK" && r.opening.teamWon !== null)
      add(r.opening.teamWon ? t.openingWon : t.openingLost, won);
    if (r.advantage.status === "OK") {
      if (r.advantage.held) add(t.advantageHeld, won);
      if (r.advantage.disadvantage) add(t.fromDisadvantage, won);
    }
    if (r.postPlant?.alive && r.postPlant.alive.own > 0)
      add(r.side === "CT" ? t.retakeCt : t.postPlantT, won);

    m.playedRounds += 1;
    if (r.opening.status === "OK") {
      m.openingRounds += 1;
      if (r.opening.byMe) m.openingKills += 1;
      if (r.opening.onMe) m.openingDeaths += 1;
    }
    m.tradeKills += r.me.tradeKills;
    if (r.me.deathTraded !== null) add(m.deathsTraded, r.me.deathTraded);
    if (r.clutch) add((m.clutches[`1v${r.clutch.opponents}`] ??= rate(0, 0)), r.clutch.won);
    if (r.me.survived !== null) add(m.survival, r.me.survived);
    if (r.me.planted) m.plants += 1;
    if (r.me.defused) m.defuses += 1;
    m.kills += r.me.kills;
    m.deaths += r.me.deaths;
    m.assists += r.me.assists;
    m.damage += r.me.damage;
    m.headshotKills += r.me.headshotKills;
    const band = r.economy.player?.label;
    if (band?.status === "CLASSIFIED") {
      const b = (m.byOwnBuy[band.category] ??= { rounds: 0, kills: 0, deaths: 0, damage: 0 });
      b.rounds += 1;
      b.kills += r.me.kills;
      b.deaths += r.me.deaths;
      b.damage += r.me.damage;
    }
  }
  return {
    version: ROUNDS_VERSION,
    rounds: reports.length,
    validRounds: reports.filter((r) => r.valid).length,
    disconnectRounds: reports.filter((r) => r.disconnect).length,
    spendRecordedRounds: reports.filter(
      (r) => r.economy.teams.T?.label.status === "CLASSIFIED" || r.economy.pistol,
    ).length,
    team: t,
    me: m,
  };
}

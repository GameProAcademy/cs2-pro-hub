/**
 * PM4 — Fase 4.2.7, módulo E: `cs2.economy.v1` (buy classification per round), pure.
 *
 * Source data (all demo-observed, never inferred from weapons, K/D or results):
 *   - money_start      round_players.money_start   (start_balance at the round start tick);
 *   - equipment_start  round_players.equipment_value (round_start_equip_value: equipment held
 *                      before buying);
 *   - money_spent      round_events(round_end).data.money_spent (cash_spent_this_round at the
 *                      round end tick; parser R5.8.31+). Purchases only happen in the buy window:
 *                      679/679 player-rounds equal the value at buytime_ended in the corpus.
 *
 * TEAM rule (unit of the classification), after Xenopoulos et al., "Valuing Actions in
 * Counter-Strike" (arXiv 2109.12990), Table 1 — team starting equipment value E plus round spend S:
 *   full_buy       E + S >= 20 000
 *   eco            E < 3 000 and S < 2 000
 *   low_buy        E < 3 000 and 2 000 <= S < 7 500
 *   half_buy       E < 3 000 and S >= 7 500
 *   hero_low_buy   E >= 3 000 and S < 7 500
 *   hero_half_buy  E >= 3 000 and S >= 7 500
 * Thresholds are for five players; a team with n != 5 players in the round uses them × n/5
 * (adaptation, flagged `scaled`).
 *
 * PISTOL overrides: every player of BOTH teams starts the round with the same money_start <= 1 000
 * (an economy reset; overtime resets to more and is never a pistol). The start equipment is not
 * used for it: a demo whose round 1 starts at tick 0 still carries warmup equipment (HLTV corpus,
 * 3 400–3 600 per player), which is also why equipment_start of such a round is not trusted.
 *
 * PLAYER rule: the same bands ÷ 5 per player (adaptation of the team rule, DERIVED); a team whose
 * players fall in different bands is a `mixed` buy. The team label is never given to a player.
 *
 * Missing data => UNKNOWN with a reason (never eco, never zero).
 */
import type { Side } from "@/lib/diagnosis/deathContext";

export const ECONOMY_VERSION = "cs2.economy.v1";
export const ECONOMY_SOURCE = "Xenopoulos et al. 2021, arXiv 2109.12990, Table 1";

export const BUY_CATEGORIES = [
  "pistol",
  "eco",
  "low_buy",
  "half_buy",
  "hero_low_buy",
  "hero_half_buy",
  "full_buy",
] as const;
export type BuyCategory = (typeof BUY_CATEGORIES)[number];

export type UnknownReason =
  "SPEND_NOT_RECORDED" | "ROSTER_INCOMPLETE" | "VALUE_MISSING" | "NO_PLAYERS";

export type BuyLabel =
  | { status: "CLASSIFIED"; category: BuyCategory; scaled: boolean }
  | { status: "UNKNOWN"; reason: UnknownReason };

/** Team thresholds for five players (USD). */
export const TEAM_THRESHOLDS = {
  fullTotal: 20000,
  equipLow: 3000,
  spendEco: 2000,
  spendHalf: 7500,
} as const;
export const PISTOL_MAX_START_MONEY = 1000;

export interface EconomyPlayerRound {
  participantKey: string;
  side: Side | null;
  moneyStart: number | null;
  equipmentStart: number | null;
  moneySpent: number | null;
}

export interface EconomyRoundInput {
  roundNumber: number;
  players: EconomyPlayerRound[];
  /** true when the round_end of this round carried `money_spent` (R5.8.31+). */
  spendRecorded: boolean;
}

export interface TeamEconomy {
  side: Side;
  players: number;
  equipmentStart: number | null;
  moneySpent: number | null;
  moneyStart: number | null;
  label: BuyLabel;
  /** Players of this team fall in different individual bands. */
  mixed: boolean | null;
}

export interface RoundEconomy {
  roundNumber: number;
  pistol: boolean;
  teams: Partial<Record<Side, TeamEconomy>>;
  /** The caller's own row, when present. */
  player: {
    side: Side | null;
    moneyStart: number | null;
    equipmentStart: number | null;
    moneySpent: number | null;
    label: BuyLabel;
  } | null;
}

const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

function band(equip: number, spend: number, scale: number): BuyCategory {
  const t = TEAM_THRESHOLDS;
  if (equip + spend >= t.fullTotal * scale) return "full_buy";
  if (equip < t.equipLow * scale) {
    if (spend < t.spendEco * scale) return "eco";
    return spend < t.spendHalf * scale ? "low_buy" : "half_buy";
  }
  return spend < t.spendHalf * scale ? "hero_low_buy" : "hero_half_buy";
}

/** Economy reset: every player of both teams with the same money_start <= 1 000. */
export function isPistolRound(players: EconomyPlayerRound[]): boolean {
  const sided = players.filter((p) => p.side === "T" || p.side === "CT");
  if (!sided.some((p) => p.side === "T") || !sided.some((p) => p.side === "CT")) return false;
  const first = sided[0]?.moneyStart;
  return (
    finite(first) &&
    first <= PISTOL_MAX_START_MONEY &&
    sided.every((p) => finite(p.moneyStart) && p.moneyStart === first)
  );
}

function playerLabel(p: EconomyPlayerRound, pistol: boolean, spendRecorded: boolean): BuyLabel {
  if (pistol) return { status: "CLASSIFIED", category: "pistol", scaled: false };
  if (!spendRecorded) return { status: "UNKNOWN", reason: "SPEND_NOT_RECORDED" };
  if (!finite(p.equipmentStart) || !finite(p.moneySpent))
    return { status: "UNKNOWN", reason: "VALUE_MISSING" };
  return {
    status: "CLASSIFIED",
    category: band(p.equipmentStart, p.moneySpent, 1 / 5),
    scaled: false,
  };
}

function teamOf(
  side: Side,
  players: EconomyPlayerRound[],
  pistol: boolean,
  spendRecorded: boolean,
): TeamEconomy {
  const mine = players.filter((p) => p.side === side);
  const sum = (pick: (p: EconomyPlayerRound) => number | null) =>
    mine.length && mine.every((p) => finite(pick(p)))
      ? mine.reduce((s, p) => s + (pick(p) as number), 0)
      : null;
  const equipmentStart = sum((p) => p.equipmentStart);
  const moneySpent = sum((p) => p.moneySpent);
  const moneyStart = sum((p) => p.moneyStart);
  let label: BuyLabel;
  if (!mine.length) label = { status: "UNKNOWN", reason: "NO_PLAYERS" };
  else if (pistol) label = { status: "CLASSIFIED", category: "pistol", scaled: false };
  else if (!spendRecorded) label = { status: "UNKNOWN", reason: "SPEND_NOT_RECORDED" };
  else if (equipmentStart === null || moneySpent === null)
    label = { status: "UNKNOWN", reason: "VALUE_MISSING" };
  else
    label = {
      status: "CLASSIFIED",
      category: band(equipmentStart, moneySpent, mine.length / 5),
      scaled: mine.length !== 5,
    };
  const individual = mine.map((p) => playerLabel(p, pistol, spendRecorded));
  const mixed =
    label.status !== "CLASSIFIED" || individual.some((l) => l.status !== "CLASSIFIED")
      ? null
      : new Set(individual.map((l) => (l.status === "CLASSIFIED" ? l.category : ""))).size > 1;
  return { side, players: mine.length, equipmentStart, moneySpent, moneyStart, label, mixed };
}

export function classifyRoundEconomy(round: EconomyRoundInput, me: string | null): RoundEconomy {
  const pistol = isPistolRound(round.players);
  const teams: Partial<Record<Side, TeamEconomy>> = {};
  for (const side of ["T", "CT"] as const) {
    if (round.players.some((p) => p.side === side))
      teams[side] = teamOf(side, round.players, pistol, round.spendRecorded);
  }
  const own = me ? round.players.find((p) => p.participantKey === me) : undefined;
  return {
    roundNumber: round.roundNumber,
    pistol,
    teams,
    player: own
      ? {
          side: own.side,
          moneyStart: finite(own.moneyStart) ? own.moneyStart : null,
          // Round-1 equipment can be warmup gear (start tick 0): never shown for a pistol round.
          equipmentStart: !pistol && finite(own.equipmentStart) ? own.equipmentStart : null,
          moneySpent: finite(own.moneySpent) ? own.moneySpent : null,
          label: playerLabel(own, pistol, round.spendRecorded),
        }
      : null,
  };
}

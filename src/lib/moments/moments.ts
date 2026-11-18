/**
 * PM5 / Fase 4.2.10 — personal moments library (module I), `cs2.moments.v1`. Pure rules.
 *
 * A moment is a reference to the caller's own match: round + tick range (+ optional canonical
 * event id). These helpers validate what the player typed and the range against the round's
 * own boundaries; the server loads those boundaries with the caller's session and the database
 * re-checks match ownership in RLS.
 */
import { z } from "zod";

export const MOMENTS_VERSION = "cs2.moments.v1";
export const MOMENT_KINDS = [
  "KILL",
  "DEATH",
  "OPENING",
  "TRADE",
  "CLUTCH",
  "MULTIKILL",
  "UTILITY",
  "PLANT",
  "DEFUSE",
  "ROUND",
  "TICK_RANGE",
] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];
export const MOMENT_SOURCES = [
  "REPLAY",
  "ROUNDS",
  "DEATHS",
  "DUELS",
  "UTILITY",
  "MAPS",
  "TRAINING",
] as const;
export type MomentSource = (typeof MOMENT_SOURCES)[number];

/** A moment never spans more than 3 minutes of game time at 64 ticks/s (the DB checks it too). */
export const MAX_RANGE_TICKS = 64 * 180;
/** Default window around a single-tick moment: 5 s before, 3 s after (clamped to the round). */
export const PRE_TICKS = 64 * 5;
export const POST_TICKS = 64 * 3;
export const MAX_TAGS = 12;
export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_COLLECTIONS = 100;
export const MAX_BOOKMARKS = 2000;

const TAG = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,23}$/u;

/** Trims, lowercases, de-duplicates; invalid tags are rejected (never silently changed). */
export function normalizeTags(raw: string[]): { ok: true; tags: string[] } | { ok: false } {
  const out: string[] = [];
  for (const r of raw) {
    const tag = r.trim().toLowerCase().replace(/\s+/g, " ");
    if (!tag) continue;
    if (!TAG.test(tag)) return { ok: false };
    if (!out.includes(tag)) out.push(tag);
  }
  return out.length <= MAX_TAGS ? { ok: true, tags: out } : { ok: false };
}

export const titleSchema = z.string().trim().min(1).max(120);
export const noteSchema = z.string().max(2000);
export const tagsSchema = z.array(z.string().max(24)).max(MAX_TAGS);

export interface RoundBounds {
  roundNumber: number;
  startTick: number | null;
  endTick: number | null;
}

export type RangeCheck =
  | { ok: true; tickStart: number; tickEnd: number }
  | {
      ok: false;
      reason:
        "ROUND_NOT_FOUND" | "ROUND_BOUNDARY_UNKNOWN" | "OUT_OF_ROUND" | "INVERTED" | "TOO_LONG";
    };

/**
 * A range must sit inside its round. A single tick (no end) becomes [tick − 5 s, tick + 3 s]
 * clamped to the round; an explicit range is kept as typed (never moved to fit).
 */
export function checkRange(
  round: RoundBounds | undefined,
  tickStart: number,
  tickEnd: number | undefined,
): RangeCheck {
  if (!round) return { ok: false, reason: "ROUND_NOT_FOUND" };
  if (round.startTick === null || round.endTick === null)
    return { ok: false, reason: "ROUND_BOUNDARY_UNKNOWN" };
  const { startTick: s, endTick: e } = round;
  if (tickEnd === undefined) {
    if (tickStart < s || tickStart > e) return { ok: false, reason: "OUT_OF_ROUND" };
    return {
      ok: true,
      tickStart: Math.max(s, tickStart - PRE_TICKS),
      tickEnd: Math.min(e, tickStart + POST_TICKS),
    };
  }
  if (tickEnd < tickStart) return { ok: false, reason: "INVERTED" };
  if (tickStart < s || tickEnd > e) return { ok: false, reason: "OUT_OF_ROUND" };
  if (tickEnd - tickStart > MAX_RANGE_TICKS) return { ok: false, reason: "TOO_LONG" };
  return { ok: true, tickStart, tickEnd };
}

/** Keyset cursor (created_at, id), opaque to the client but validated on the way back. */
export function encodeCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  const [createdAt, id, extra] = cursor.split("|");
  if (extra !== undefined || !createdAt || !id) return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return { createdAt, id };
}

/** Replay deep link of a bookmark: its own match, round and first tick. */
export function replaySearch(b: {
  matchId: string;
  roundNumber: number | null;
  tickStart: number;
}) {
  return {
    matchId: b.matchId,
    ...(b.roundNumber !== null ? { round: b.roundNumber } : {}),
    tick: b.tickStart,
  };
}

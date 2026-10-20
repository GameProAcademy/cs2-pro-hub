/**
 * Read-only operator diagnostics for the RAW-V2-12 rounds gate: round numbers, their
 * boundary ticks and the lifecycle event ticks they were paired from. Ticks, numbers,
 * side codes and field NAMES only: no player, name, path or demo content.
 */
export const ROUND_LIFECYCLE_EVENTS = [
  "begin_new_match",
  "round_announce_match_start",
  "round_start",
  "round_freeze_end",
  "round_end",
  "round_officially_ended",
  "cs_win_panel_match",
  "cs_pre_restart",
  "round_prestart",
  "round_poststart",
  "round_announce_last_round_half",
  "announce_phase_end",
  "cs_intermission",
  "round_time_warning",
] as const;

const KILL_EVENT = "player_death";
const BOMB_EVENTS = ["bomb_planted", "bomb_defused", "bomb_exploded"] as const;
const STATE_FIELDS = [
  "total_rounds_played",
  "is_freeze_period",
  "is_warmup_period",
  "game_phase",
  "is_match_started",
  "round_win_status",
] as const;

const LIST_CAP = 200;

const tickOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

const scalar = (value: unknown): number | boolean | null =>
  typeof value === "boolean"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;

/**
 * Kills and bomb events placed against the round intervals: counts and ticks only.
 * A victim identity is used to count repeated deaths inside one interval and is
 * never returned.
 */
function summarizeCombat(
  rounds: ReadonlyArray<{
    number: number | null;
    start_tick: number | null;
    end_tick: number | null;
  }>,
  eventRows: ReadonlyArray<Record<string, unknown>>,
) {
  const closed = rounds.filter(
    (r): r is { number: number; start_tick: number; end_tick: number | null } =>
      r.number !== null && r.start_tick !== null,
  );
  const locate = (tick: number) => {
    for (let i = 0; i < closed.length; i += 1) {
      const r = closed[i]!;
      const nextStart = closed[i + 1]?.start_tick ?? null;
      const upper = r.end_tick ?? (nextStart !== null ? nextStart - 1 : null);
      if (tick >= r.start_tick && (upper === null || tick <= upper)) return r.number;
    }
    return null;
  };
  const perRound = new Map<
    number,
    {
      kills: number;
      repeated_victims: number;
      seen: Set<string>;
      played: Set<string>;
      deaths: Map<string, Array<Record<string, unknown>>>;
    }
  >();
  const killsOutside: number[] = [];
  const bomb: Array<{ event: string; tick: number; round: number | null }> = [];
  for (const row of eventRows) {
    const name = row["event_name"];
    const tick = tickOf(row["tick"]);
    if (tick === null || typeof name !== "string") continue;
    if (name === KILL_EVENT) {
      const round = locate(tick);
      if (round === null) {
        if (killsOutside.length < LIST_CAP) killsOutside.push(tick);
        continue;
      }
      const entry = perRound.get(round) ?? {
        kills: 0,
        repeated_victims: 0,
        seen: new Set<string>(),
        played: new Set<string>(),
        deaths: new Map<string, Array<Record<string, unknown>>>(),
      };
      entry.kills += 1;
      const raw = row["raw_fields"];
      const fields =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      // Game-rules context recorded with the event (total rounds played at that tick).
      const played = scalar(row["total_rounds_played"] ?? fields["total_rounds_played"]);
      entry.played.add(played === null ? "unknown" : String(played));
      const victim = fields["user_steamid"] ?? fields["userid"];
      if (typeof victim === "string" || typeof victim === "number") {
        const key = String(victim);
        if (entry.seen.has(key)) entry.repeated_victims += 1;
        entry.seen.add(key);
        // Non-identifying facts about each death, kept only to describe repeats.
        const attacker = fields["attacker_steamid"] ?? fields["attacker"];
        const weapon = fields["weapon"];
        const list = entry.deaths.get(key) ?? [];
        list.push({
          tick,
          weapon: typeof weapon === "string" ? weapon.slice(0, 32) : null,
          attacker_present:
            attacker != null && attacker !== "" && attacker !== 0 && attacker !== "0",
          attacker_is_victim: attacker != null && String(attacker) === key,
          field_names: Object.keys(fields).sort().slice(0, 40),
        });
        entry.deaths.set(key, list);
      }
      perRound.set(round, entry);
    } else if ((BOMB_EVENTS as readonly string[]).includes(name) && bomb.length < LIST_CAP) {
      bomb.push({ event: name, tick, round: locate(tick) });
    }
  }
  bomb.sort((a, b) => a.tick - b.tick);
  killsOutside.sort((a, b) => a - b);
  return {
    kills_per_round: [...perRound.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, entry]) => ({
        round,
        kills: entry.kills,
        repeated_victims: entry.repeated_victims,
        total_rounds_played_at_kills: [...entry.played].sort(),
        repeated_victim_deaths: [...entry.deaths.values()]
          .filter((deaths) => deaths.length > 1)
          .slice(0, 10),
      })),
    kills_outside_rounds: { count: killsOutside.length, ticks: killsOutside },
    bomb_events: bomb,
  };
}

/** Round-state changes in the sampled tick rows: tick + game-rules values only. */
function summarizeStateTimeline(tickRows: ReadonlyArray<Record<string, unknown>>) {
  const byTick = new Map<number, Record<string, number | boolean | null>>();
  for (const row of tickRows) {
    const tick = tickOf(row["tick"]);
    if (tick === null || byTick.has(tick)) continue;
    const state: Record<string, number | boolean | null> = {};
    for (const field of STATE_FIELDS) state[field] = scalar(row[field]);
    byTick.set(tick, state);
  }
  const ticks = [...byTick.keys()].sort((a, b) => a - b);
  const changes: Array<Record<string, number | boolean | null>> = [];
  let previous: string | null = null;
  for (const tick of ticks) {
    const state = byTick.get(tick)!;
    const key = JSON.stringify(state);
    if (key !== previous && changes.length < LIST_CAP) changes.push({ tick, ...state });
    previous = key;
  }
  return {
    sampled_ticks: ticks.length,
    first_tick: ticks[0] ?? null,
    last_tick: ticks.at(-1) ?? null,
    changes,
  };
}

export function summarizeRoundDiagnostics(
  roundRows: ReadonlyArray<Record<string, unknown>>,
  eventRows: ReadonlyArray<Record<string, unknown>>,
  tickRows: ReadonlyArray<Record<string, unknown>> = [],
) {
  const rounds = roundRows.slice(0, LIST_CAP).map((row) => ({
    number: tickOf(row["number"]),
    start_tick: tickOf(row["start_tick"]),
    end_tick: tickOf(row["end_tick"]),
    has_winner: row["winner_side"] != null || row["winner"] != null,
    ...(typeof row["start_derived_from"] === "string"
      ? { start_derived_from: String(row["start_derived_from"]).slice(0, 64) }
      : {}),
    ...(typeof row["end_derived_from"] === "string"
      ? { end_derived_from: String(row["end_derived_from"]).slice(0, 64) }
      : {}),
  }));
  const lifecycle: Record<string, { count: number; ticks: number[] }> = {};
  const roundEndFields = new Set<string>();
  const roundEndWinnerValues = new Set<string>();
  for (const name of ROUND_LIFECYCLE_EVENTS) lifecycle[name] = { count: 0, ticks: [] };
  for (const row of eventRows) {
    const name = row["event_name"];
    if (typeof name !== "string" || !(name in lifecycle)) continue;
    const entry = lifecycle[name]!;
    entry.count += 1;
    const tick = tickOf(row["tick"]);
    if (tick !== null && entry.ticks.length < LIST_CAP) entry.ticks.push(tick);
    const raw = row["raw_fields"];
    if (name === "round_end" && raw && typeof raw === "object" && !Array.isArray(raw)) {
      const fields = raw as Record<string, unknown>;
      Object.keys(fields).forEach((key) => roundEndFields.add(key));
      const winner = fields["winner"];
      if (typeof winner === "string" || typeof winner === "number")
        roundEndWinnerValues.add(String(winner).slice(0, 16));
    }
  }
  for (const entry of Object.values(lifecycle)) entry.ticks.sort((a, b) => a - b);
  return {
    round_rows: roundRows.length,
    rounds,
    rounds_without_start: rounds.filter((r) => r.start_tick === null).map((r) => r.number),
    rounds_without_end: rounds.filter((r) => r.end_tick === null).map((r) => r.number),
    lifecycle,
    round_end_raw_fields: [...roundEndFields].sort(),
    round_end_winner_values: [...roundEndWinnerValues].sort(),
    combat: summarizeCombat(rounds, eventRows),
    state_timeline: summarizeStateTimeline(tickRows),
  };
}

/** gzip JSONL -> rows (bounded by the caller to small sections). */
export async function decodeGzipJsonLines(bytes: Uint8Array<ArrayBuffer>) {
  const text = await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

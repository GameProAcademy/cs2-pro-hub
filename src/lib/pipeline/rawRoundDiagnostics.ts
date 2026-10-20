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
] as const;

const LIST_CAP = 200;

const tickOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

export function summarizeRoundDiagnostics(
  roundRows: ReadonlyArray<Record<string, unknown>>,
  eventRows: ReadonlyArray<Record<string, unknown>>,
) {
  const rounds = roundRows.slice(0, LIST_CAP).map((row) => ({
    number: tickOf(row["number"]),
    start_tick: tickOf(row["start_tick"]),
    end_tick: tickOf(row["end_tick"]),
    has_winner: row["winner_side"] != null || row["winner"] != null,
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

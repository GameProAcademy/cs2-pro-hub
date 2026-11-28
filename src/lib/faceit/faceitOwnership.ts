/**
 * VGL 5.0 — Frente 8: which canonical matches a FACEIT observation may write source-scoped
 * columns and player metrics onto.
 *
 * The Match Identity Resolver may attach a FACEIT observation to a match the DEMO pipeline
 * already produced (cross-source convergence). That link is recorded in `match_sources`, but
 * the demo row stays the authority: its `match_metrics` (parsed from the demo) and its
 * `source_*` bookkeeping must never be overwritten by FACEIT's coarser numbers. Only rows the
 * FACEIT source owns (`data_source = 'faceit'`) are writable here.
 */
export interface CanonicalOwnerRow {
  id: string;
  data_source: string | null;
}

export function faceitWritableMatchIds(rows: ReadonlyArray<CanonicalOwnerRow>): {
  writable: string[];
  linkedToDemo: string[];
} {
  const writable: string[] = [];
  const linkedToDemo: string[] = [];
  for (const row of rows) {
    if (row.data_source === "faceit") writable.push(row.id);
    else linkedToDemo.push(row.id);
  }
  return { writable, linkedToDemo };
}

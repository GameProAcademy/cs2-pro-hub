/**
 * FASE 2.6.5 — transactional, idempotent persistence of ONE canonical
 * observation (server-only, service role).
 *
 * The whole write is a SINGLE database routine
 * (`public.persist_canonical_observation`), so an observation is either fully
 * stored or not stored at all. Idempotency keys:
 *
 *   - `(source, externalMatchId)` when the source has an external identifier;
 *   - `(source, fingerprint)` for a demo (SHA-256 of the file);
 *   - the upload id, so the demo pipeline and the canonical engine converge on
 *     the SAME canonical match instead of duplicating it.
 *
 * Nothing here merges sources: source priority only decides which observation
 * may WRITE the canonical facts, and a weaker source never overwrites a
 * stronger one.
 */
import { CANONICAL_SCHEMA_VERSION } from "./canonical.versions";
import type { CanonicalMatchBundle, CanonicalSeries } from "./canonical.types";

export interface CanonicalPersistResult {
  matchId: string;
  seriesId: string | null;
  matchSourceId: string;
  created: boolean;
  roundsWritten: number;
  roundPlayersWritten: number;
  eventsWritten: number;
}

export class CanonicalPersistenceError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "CanonicalPersistenceError";
  }
}

/**
 * Serialises a bundle for the database routine. It is a pure JSON projection:
 * no field is renamed, defaulted or dropped, so `null` stays `null` and never
 * becomes `0`.
 */
export function canonicalBundleToRpcPayload(bundle: CanonicalMatchBundle): unknown {
  if (bundle.match.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    throw new CanonicalPersistenceError(
      "CANONICAL_SCHEMA_UNSUPPORTED",
      `bundle=${bundle.match.schemaVersion} expected=${CANONICAL_SCHEMA_VERSION}`,
    );
  }
  if (!bundle.observation.externalMatchId && !bundle.observation.fingerprint) {
    // The caller may still supply an upload id, which the routine accepts as a
    // last-resort identity. Anything else would silently duplicate matches.
    if (!bundle.observation.source) {
      throw new CanonicalPersistenceError("CANONICAL_OBSERVATION_UNIDENTIFIABLE");
    }
  }
  return JSON.parse(JSON.stringify(bundle)) as unknown;
}

export async function persistCanonicalObservation(args: {
  bundle: CanonicalMatchBundle;
  /** Player the collection was run for, when known. Never invented. */
  ownerPlayerId?: string | null;
  /** Upload the observation came from, for a demo. */
  uploadId?: string | null;
  /**
   * Canonical match this observation must join, as decided by the Match
   * Identity Resolver. Set ONLY for a positive, non-reviewable decision.
   */
  attachMatchId?: string | null;
}): Promise<CanonicalPersistResult> {
  const payload = canonicalBundleToRpcPayload(args.bundle);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // FASE 2.6.11.1 — attach + persistence are ONE database transaction. The
  // attach reservation is what makes two sources converge on a single canonical
  // match, and running it inside the same routine means a later failure rolls it
  // back too: no partial attach, no orphan source. It still never merges facts —
  // source precedence alone decides which observation may write them.
  const { data, error } = await supabaseAdmin.rpc("persist_canonical_observation_attached", {
    _bundle: payload as never,
    // Omitted (not null) so the routine's own defaults apply.
    ...(args.ownerPlayerId ? { _owner_player_id: args.ownerPlayerId } : {}),
    ...(args.uploadId ? { _upload_id: args.uploadId } : {}),
    ...(args.attachMatchId && args.bundle.observation.externalMatchId
      ? { _attach_match_id: args.attachMatchId }
      : {}),
  });

  if (error) throw new CanonicalPersistenceError("CANONICAL_PERSISTENCE_FAILED", error.message);

  const row = (data ?? null) as {
    match_id?: string;
    series_id?: string | null;
    match_source_id?: string;
    created?: boolean;
    rounds_written?: number;
    round_players_written?: number;
    events_written?: number;
  } | null;

  if (!row?.match_id || !row.match_source_id) {
    throw new CanonicalPersistenceError("CANONICAL_PERSISTENCE_FAILED", "empty routine result");
  }

  return {
    matchId: row.match_id,
    seriesId: row.series_id ?? null,
    matchSourceId: row.match_source_id,
    created: row.created === true,
    roundsWritten: row.rounds_written ?? 0,
    roundPlayersWritten: row.round_players_written ?? 0,
    eventsWritten: row.events_written ?? 0,
  };
}

export interface CanonicalSeriesPersistResult {
  seriesId: string;
  matchSourceId: string;
  created: boolean;
}

/**
 * Persists a SERIES-ONLY observation: a series the source proved exists (a
 * BO3/BO5) whose individual maps it never reported. No placeholder match is
 * created — a match with no map and no score would be a lie.
 */
export async function persistCanonicalSeriesObservation(args: {
  series: CanonicalSeries;
  observation: {
    source: string;
    externalSeriesId: string;
    sourceContractVersion: string;
    sourceVersion: string | null;
    fetchedAt: string;
    status?: "complete" | "incomplete" | "stale" | "conflicting" | "unknown";
    quality?: unknown;
    metadata?: Record<string, unknown>;
  };
  ownerPlayerId?: string | null;
}): Promise<CanonicalSeriesPersistResult> {
  if (args.series.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    throw new CanonicalPersistenceError(
      "CANONICAL_SCHEMA_UNSUPPORTED",
      `series=${args.series.schemaVersion} expected=${CANONICAL_SCHEMA_VERSION}`,
    );
  }
  if (!args.observation.externalSeriesId) {
    throw new CanonicalPersistenceError("CANONICAL_OBSERVATION_UNIDENTIFIABLE");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("persist_canonical_series_observation", {
    _series: JSON.parse(JSON.stringify(args.series)) as never,
    _observation: JSON.parse(
      JSON.stringify({ status: "incomplete", quality: {}, metadata: {}, ...args.observation }),
    ) as never,
    ...(args.ownerPlayerId ? { _owner_player_id: args.ownerPlayerId } : {}),
  });

  if (error) throw new CanonicalPersistenceError("CANONICAL_PERSISTENCE_FAILED", error.message);

  const row = (data ?? null) as {
    series_id?: string;
    match_source_id?: string;
    created?: boolean;
  } | null;
  if (!row?.series_id || !row.match_source_id) {
    throw new CanonicalPersistenceError("CANONICAL_PERSISTENCE_FAILED", "empty routine result");
  }
  return {
    seriesId: row.series_id,
    matchSourceId: row.match_source_id,
    created: row.created === true,
  };
}

-- Player DNA snapshots with provenance (2026-10-28).
--
-- player_dna_snapshots existed (10 dimension columns on [0,100], service-role write, owner/staff read) but no
-- code path ever wrote it: Player DNA was computed live from match_features on every page view and never
-- persisted. This migration only ADDS the columns a reproducible snapshot needs; no existing column, policy,
-- grant or row changes.
--   dna_version        aggregation version (src/lib/playerDna.ts)
--   state              INSUFFICIENT_SAMPLE | READY (an EMPTY profile is never stored)
--   source_match_ids   the exact matches whose match_features rows were aggregated
--   match_count / round_count / partial_matches   sample actually used
--   feature_versions   distinct "schema_version:analysis_version" of the aggregated feature rows
--   input_digest       sha256 of the aggregated inputs; one snapshot per (player, input) => idempotent
BEGIN;

ALTER TABLE public.player_dna_snapshots
  ADD COLUMN IF NOT EXISTS dna_version text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS source_match_ids uuid[],
  ADD COLUMN IF NOT EXISTS match_count integer,
  ADD COLUMN IF NOT EXISTS round_count integer,
  ADD COLUMN IF NOT EXISTS partial_matches integer,
  ADD COLUMN IF NOT EXISTS feature_versions text[],
  ADD COLUMN IF NOT EXISTS input_digest text;

DO $dna$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_dna_snapshots_provenance_check'
                   AND conrelid = 'public.player_dna_snapshots'::regclass) THEN
    ALTER TABLE public.player_dna_snapshots ADD CONSTRAINT player_dna_snapshots_provenance_check CHECK (
      input_digest IS NULL OR (
        input_digest ~ '^[0-9a-f]{64}$'
        AND state IN ('INSUFFICIENT_SAMPLE', 'READY')
        AND dna_version IS NOT NULL
        AND match_count >= 1
        AND cardinality(source_match_ids) = match_count
        AND (round_count IS NULL OR round_count >= 0)
        AND partial_matches >= 0
      ));
  END IF;
END
$dna$;

-- Not partial, so ON CONFLICT (player_id, input_digest) can use it; NULL digests (legacy rows) never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS player_dna_snapshots_player_input_uniq
  ON public.player_dna_snapshots (player_id, input_digest);

COMMIT;

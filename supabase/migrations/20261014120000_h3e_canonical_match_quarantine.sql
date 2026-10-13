-- H.3-E canonical match quarantine: preserve a Canonical row and remove it from eligibility.
--
-- A row in public.canonical_match_quarantine keeps its match exactly as ingested and makes it
-- ineligible for Canonical promotion and for every derived layer:
--   * the match row cannot be updated (no partial -> completed) or deleted;
--   * its canonical children (sources, participants, rounds, round players, round events)
--     cannot be inserted, updated or deleted;
--   * match_metrics and match_features rows (the inputs of analysis, Player DNA, Pro Score,
--     training plans and the AI Coach) cannot be written for it.
-- The guard is a BEFORE trigger, so it applies to every writer, SECURITY DEFINER routines and
-- the service role included, and fails closed with CANONICAL_MATCH_QUARANTINED (55000).
--
-- The quarantine registry is append-only: UPDATE, DELETE and TRUNCATE are refused. Releasing a
-- quarantined match is deliberately NOT implemented here; it needs its own reviewed mechanism.
-- This migration creates no quarantine row: quarantining a production match is a separate,
-- explicitly authorized operator step (docs/H3E_CANONICAL_QUARANTINE.md).
--
-- Consequence, by design: a cascading or SET NULL foreign-key action that would touch a
-- quarantined match (deleting its player profile, upload or series) is refused as well.

CREATE TABLE IF NOT EXISTS public.canonical_match_quarantine (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('PRE_PROVENANCE_CANONICAL_ROW')),
  decision_ref text NOT NULL CHECK (length(btrim(decision_ref)) BETWEEN 1 AND 200),
  quarantined_by text NOT NULL CHECK (length(btrim(quarantined_by)) BETWEEN 1 AND 200),
  -- Identity of the row at quarantine time (status, fingerprint, upload, counts), for audit.
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  quarantined_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.canonical_match_quarantine IS
  'H.3-E append-only registry of Canonical matches preserved as ingested and excluded from Canonical eligibility and every derived layer. No release path.';

ALTER TABLE public.canonical_match_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_match_quarantine FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canonical_match_quarantine FROM PUBLIC, anon, authenticated;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.canonical_match_quarantine FROM sandbox_exec';
  END IF;
END;
$grants$;
REVOKE ALL ON TABLE public.canonical_match_quarantine FROM service_role;
GRANT SELECT, INSERT ON TABLE public.canonical_match_quarantine TO service_role;
-- Service role bypasses RLS; no policy exists for any client role, so clients see nothing.

CREATE OR REPLACE FUNCTION public.refuse_canonical_quarantine_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'CANONICAL_QUARANTINE_IMMUTABLE' USING ERRCODE = '55000';
END;
$fn$;
REVOKE ALL ON FUNCTION public.refuse_canonical_quarantine_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS canonical_match_quarantine_immutable ON public.canonical_match_quarantine;
CREATE TRIGGER canonical_match_quarantine_immutable
BEFORE UPDATE OR DELETE ON public.canonical_match_quarantine
FOR EACH ROW EXECUTE FUNCTION public.refuse_canonical_quarantine_change();

DROP TRIGGER IF EXISTS canonical_match_quarantine_no_truncate ON public.canonical_match_quarantine;
CREATE TRIGGER canonical_match_quarantine_no_truncate
BEFORE TRUNCATE ON public.canonical_match_quarantine
FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_canonical_quarantine_change();

CREATE OR REPLACE FUNCTION public.is_canonical_match_quarantined(_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id = _match_id);
$fn$;
REVOKE ALL ON FUNCTION public.is_canonical_match_quarantined(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_canonical_match_quarantined(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_canonical_match_quarantine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  _old uuid;
  _new uuid;
BEGIN
  IF TG_TABLE_NAME = 'matches' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN _old := OLD.id; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN _new := NEW.id; END IF;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN _old := OLD.match_id; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN _new := NEW.match_id; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.canonical_match_quarantine q WHERE q.match_id IN (_old, _new)) THEN
    RAISE EXCEPTION 'CANONICAL_MATCH_QUARANTINED' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_canonical_match_quarantine() FROM PUBLIC, anon, authenticated;

-- TRUNCATE skips row triggers: while any match is quarantined, the guarded tables cannot be truncated.
CREATE OR REPLACE FUNCTION public.guard_canonical_quarantine_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.canonical_match_quarantine) THEN
    RAISE EXCEPTION 'CANONICAL_MATCH_QUARANTINED' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_canonical_quarantine_truncate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS canonical_quarantine_guard ON public.matches;
CREATE TRIGGER canonical_quarantine_guard
BEFORE UPDATE OR DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_match_quarantine();

DO $guards$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['match_sources', 'match_participants', 'match_rounds', 'round_players',
                                'round_events', 'match_metrics', 'match_features'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS canonical_quarantine_guard ON public.%I', _table);
    EXECUTE format('CREATE TRIGGER canonical_quarantine_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_match_quarantine()', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['matches', 'match_sources', 'match_participants', 'match_rounds', 'round_players',
                                'round_events', 'match_metrics', 'match_features'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS canonical_quarantine_no_truncate ON public.%I', _table);
    EXECUTE format('CREATE TRIGGER canonical_quarantine_no_truncate BEFORE TRUNCATE ON public.%I '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_canonical_quarantine_truncate()', _table);
  END LOOP;
END;
$guards$;

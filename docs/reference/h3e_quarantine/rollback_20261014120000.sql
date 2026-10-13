-- Rollback of 20261014120000_h3e_canonical_match_quarantine.sql.
-- Fails closed while any match is quarantined: removing the guards would make a preserved,
-- ineligible row eligible again. Releasing a quarantined match needs its own reviewed decision.
-- Roll back 20261014120100 (snapshot v3) first: the v3 snapshot reads this table.
DO $rollback$
BEGIN
  IF pg_catalog.to_regclass('public.canonical_match_quarantine') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.canonical_match_quarantine) THEN
    RAISE EXCEPTION 'H3E_QUARANTINE_ROLLBACK_REFUSED_ROWS_PRESENT' USING ERRCODE = '55000';
  END IF;
END;
$rollback$;
DROP TRIGGER IF EXISTS canonical_quarantine_guard ON public.matches;
DROP TRIGGER IF EXISTS canonical_quarantine_no_truncate ON public.matches;
DO $drop$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['match_sources', 'match_participants', 'match_rounds', 'round_players',
                                'round_events', 'match_metrics', 'match_features'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS canonical_quarantine_guard ON public.%I', _table);
    EXECUTE format('DROP TRIGGER IF EXISTS canonical_quarantine_no_truncate ON public.%I', _table);
  END LOOP;
END;
$drop$;
DROP TABLE IF EXISTS public.canonical_match_quarantine;
DROP FUNCTION IF EXISTS public.guard_canonical_match_quarantine();
DROP FUNCTION IF EXISTS public.guard_canonical_quarantine_truncate();
DROP FUNCTION IF EXISTS public.is_canonical_match_quarantined(uuid);
DROP FUNCTION IF EXISTS public.refuse_canonical_quarantine_change();

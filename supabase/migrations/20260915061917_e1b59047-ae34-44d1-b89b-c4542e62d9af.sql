ALTER TABLE public.raw_demo_evidence_reports
  ADD COLUMN IF NOT EXISTS raw_player_info jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.prevent_raw_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.upload_id IS DISTINCT FROM OLD.upload_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.attempt IS DISTINCT FROM OLD.attempt
     OR NEW.demo_sha256 IS DISTINCT FROM OLD.demo_sha256
     OR NEW.evidence_version IS DISTINCT FROM OLD.evidence_version
     OR NEW.parser_name IS DISTINCT FROM OLD.parser_name
     OR NEW.parser_version IS DISTINCT FROM OLD.parser_version
     OR NEW.parser_revision IS DISTINCT FROM OLD.parser_revision
     OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
     OR NEW.manifest IS DISTINCT FROM OLD.manifest
     OR NEW.event_coverage IS DISTINCT FROM OLD.event_coverage
     OR NEW.raw_events IS DISTINCT FROM OLD.raw_events
     OR NEW.raw_player_info IS DISTINCT FROM OLD.raw_player_info
     OR NEW.player_coverage IS DISTINCT FROM OLD.player_coverage
     OR NEW.tick_coverage IS DISTINCT FROM OLD.tick_coverage
     OR NEW.tick_samples IS DISTINCT FROM OLD.tick_samples
     OR NEW.grenade_coverage IS DISTINCT FROM OLD.grenade_coverage
     OR NEW.grenade_samples IS DISTINCT FROM OLD.grenade_samples
     OR NEW.round_evidence IS DISTINCT FROM OLD.round_evidence
     OR NEW.economy_coverage IS DISTINCT FROM OLD.economy_coverage
     OR NEW.field_mappings IS DISTINCT FROM OLD.field_mappings
     OR NEW.gates IS DISTINCT FROM OLD.gates
     OR NEW.deterministic_digest IS DISTINCT FROM OLD.deterministic_digest
     OR NEW.forensic_inventory IS DISTINCT FROM OLD.forensic_inventory
  THEN
    RAISE EXCEPTION 'RAW_EVIDENCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_raw_evidence_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_raw_evidence_mutation() TO service_role;
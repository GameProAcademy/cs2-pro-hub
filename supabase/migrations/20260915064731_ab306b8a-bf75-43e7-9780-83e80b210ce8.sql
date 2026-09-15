ALTER TABLE public.raw_demo_evidence_reports
  ADD COLUMN IF NOT EXISTS audited_evidence_digest text;

UPDATE public.raw_demo_evidence_reports
SET audited_evidence_digest = deterministic_digest
WHERE audited_evidence_digest IS NULL;

ALTER TABLE public.raw_demo_evidence_reports
  ALTER COLUMN audited_evidence_digest SET NOT NULL,
  DROP CONSTRAINT IF EXISTS raw_demo_evidence_reports_audited_digest_check,
  DROP CONSTRAINT IF EXISTS raw_demo_evidence_reports_approval_check;

ALTER TABLE public.raw_demo_evidence_reports
  ADD CONSTRAINT raw_demo_evidence_reports_audited_digest_check
    CHECK (
      audited_evidence_digest ~ '^[0-9a-f]{64}$'
      AND audited_evidence_digest = deterministic_digest
    ),
  ADD CONSTRAINT raw_demo_evidence_reports_approval_check
    CHECK (
      (approved_for_canonical = false AND raw_audit_status IN ('PENDING', 'BLOCKED') AND approved_at IS NULL AND approved_by IS NULL)
      OR
      (approved_for_canonical = true AND raw_status = 'PASS' AND raw_audit_status = 'APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND audited_evidence_digest = deterministic_digest)
    );

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
     OR NEW.audited_evidence_digest IS DISTINCT FROM OLD.audited_evidence_digest
     OR NEW.forensic_inventory IS DISTINCT FROM OLD.forensic_inventory
     OR NEW.raw_status IS DISTINCT FROM OLD.raw_status
     OR NEW.raw_block_reasons IS DISTINCT FROM OLD.raw_block_reasons
     OR NEW.approved_for_canonical IS DISTINCT FROM OLD.approved_for_canonical
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.audit_version IS DISTINCT FROM OLD.audit_version
     OR NEW.raw_audit_status IS DISTINCT FROM OLD.raw_audit_status
  THEN
    RAISE EXCEPTION 'RAW_EVIDENCE_AND_AUDIT_DECISION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_raw_evidence_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'RAW_EVIDENCE_IMMUTABLE_NO_DELETE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS raw_demo_evidence_reports_no_delete ON public.raw_demo_evidence_reports;
CREATE TRIGGER raw_demo_evidence_reports_no_delete
BEFORE DELETE ON public.raw_demo_evidence_reports
FOR EACH ROW EXECUTE FUNCTION public.prevent_raw_evidence_deletion();

REVOKE ALL ON FUNCTION public.prevent_raw_evidence_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_raw_evidence_mutation() TO service_role;
REVOKE ALL ON FUNCTION public.prevent_raw_evidence_deletion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_raw_evidence_deletion() TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON public.raw_demo_evidence_reports FROM service_role;
GRANT SELECT, INSERT ON public.raw_demo_evidence_reports TO service_role;
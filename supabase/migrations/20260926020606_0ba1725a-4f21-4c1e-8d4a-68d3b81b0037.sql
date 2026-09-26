-- R4.1-C: additive identity preparation ONLY; no writer is authorized.
ALTER TABLE public.h3e91_execution_evidence_ledger
  ADD COLUMN event_id uuid,
  ADD COLUMN execution_id uuid,
  ADD COLUMN event_at timestamptz,
  ADD COLUMN upload_id uuid,
  ADD COLUMN correlation_id uuid,
  ADD COLUMN outcome_code text,
  ADD COLUMN event_version integer;
CREATE UNIQUE INDEX h3e91_execution_event_id_unique ON public.h3e91_execution_evidence_ledger (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX h3e91_execution_identity_events ON public.h3e91_execution_evidence_ledger (execution_id, created_at) WHERE execution_id IS NOT NULL;
ALTER TABLE public.h3e91_execution_evidence_ledger
  ADD CONSTRAINT h3e91_event_identity_complete CHECK (
    (event_id IS NULL AND execution_id IS NULL AND event_at IS NULL AND event_version IS NULL)
    OR (event_id IS NOT NULL AND execution_id IS NOT NULL AND event_at IS NOT NULL AND event_version = 1)
  ),
  ADD CONSTRAINT h3e91_event_surface_known CHECK (
    execution_surface IN ('APP_REMOTE_PARSER', 'RAILWAY_DURABLE_WORKER', 'RAILWAY_V1_PARSE', 'BROWSER_WASM_POC')
  ) NOT VALID,
  ADD CONSTRAINT h3e91_parser_identity_nonempty CHECK (
    length(trim(parser_name)) > 0 AND length(trim(parser_version)) > 0 AND length(trim(parser_revision)) > 0
  ) NOT VALID,
  ADD CONSTRAINT h3e91_outcome_code_bounded CHECK (
    outcome_code IS NULL OR (outcome_code ~ '^[A-Z][A-Z0-9_]{0,63}$' AND event_type IN ('EXECUTION_FINISHED','EXECUTION_FAILED','EXECUTION_ABORTED'))
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.h3e91_execution_evidence_ledger FROM PUBLIC, anon, authenticated, sandbox_exec, service_role;
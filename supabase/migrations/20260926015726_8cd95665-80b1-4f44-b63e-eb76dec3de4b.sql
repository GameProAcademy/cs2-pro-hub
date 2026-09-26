-- R4.1 safety repair: revoke the previously observed sandbox direct-write grant.
-- No writer is enabled while any parser entry point remains uninstrumented.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.h3e91_execution_evidence_ledger FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.h3e91_execution_evidence_ledger FROM service_role, anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.h3e91_reject_ledger_mutation() FROM sandbox_exec, service_role, anon, authenticated, PUBLIC;
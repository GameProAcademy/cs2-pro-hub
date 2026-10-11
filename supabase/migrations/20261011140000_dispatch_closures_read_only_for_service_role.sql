-- demo_job_dispatch_closures is an audit trail: rows are written only by
-- close_demo_parse_dispatch (SECURITY DEFINER, owner-only). The table was
-- created with "GRANT SELECT TO service_role", but a database whose default
-- privileges give service_role every right on new tables (the managed one
-- does: the ACL read back was service_role=arwdDxtm) left it writable.
-- Grants are made explicit so the result does not depend on defaults.
REVOKE ALL ON TABLE public.demo_job_dispatch_closures FROM service_role;
GRANT SELECT ON TABLE public.demo_job_dispatch_closures TO service_role;

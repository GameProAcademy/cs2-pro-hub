REVOKE ALL ON TABLE public.r5_forensic_staging FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
GRANT SELECT, INSERT, UPDATE ON TABLE public.r5_forensic_staging TO service_role;
GRANT SELECT ON TABLE public.r5_forensic_staging TO sandbox_exec;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.r5_forensic_staging FROM service_role, sandbox_exec;

REVOKE ALL ON FUNCTION public.r5_real_dem_access_gate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r5_real_dem_access_gate(uuid) TO service_role, sandbox_exec;

REVOKE ALL ON FUNCTION public.guard_r5_forensic_staging() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
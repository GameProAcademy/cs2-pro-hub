REVOKE EXECUTE ON FUNCTION public.record_demo_identity_event(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.requeue_demo_job_after_attachment(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decide_demo_automatic_identity(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_demo_identity_event(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_demo_job_after_attachment(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_demo_automatic_identity(uuid, uuid, text, text) TO service_role;
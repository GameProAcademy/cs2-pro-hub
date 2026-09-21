CREATE POLICY parser_runtime_provenance_service_role_only
ON public.parser_runtime_provenance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
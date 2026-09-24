CREATE OR REPLACE FUNCTION public.record_parser_runtime_attestation_with_secret(
  _canonical_payload text,
  _payload jsonb,
  _attestation_digest text,
  _signature text,
  _release_gate_evidence jsonb,
  _attested_at timestamptz,
  _nonce text,
  _hmac_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _provenance_id uuid;
BEGIN
  IF _hmac_secret IS NULL OR length(_hmac_secret) < 32 THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_SECRET_NOT_CONFIGURED' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.settings.parser_attestation_hmac_secret',
    _hmac_secret,
    true
  );

  _provenance_id := public.record_parser_runtime_attestation(
    _canonical_payload,
    _payload,
    _attestation_digest,
    _signature,
    _release_gate_evidence,
    _attested_at,
    _nonce
  );

  RETURN _provenance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation_with_secret(text,jsonb,text,text,jsonb,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation_with_secret(text,jsonb,text,text,jsonb,timestamptz,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.record_parser_runtime_attestation_with_secret(text,jsonb,text,text,jsonb,timestamptz,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_parser_runtime_attestation_with_secret(text,jsonb,text,text,jsonb,timestamptz,text,text) TO service_role;

COMMENT ON FUNCTION public.record_parser_runtime_attestation_with_secret(text,jsonb,text,text,jsonb,timestamptz,text,text) IS
  'H.3-E.2 service-only bridge. Injects the parser attestation HMAC secret transaction-locally, delegates all authoritative checks to record_parser_runtime_attestation, and never persists or returns the secret.';
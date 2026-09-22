DO $$
DECLARE
  _definition text;
  _old text := 'IF extensions.crypt(_expected_signature, ''$2a$06$'' || substr(_signature, 1, 22)) <> extensions.crypt(_signature, ''$2a$06$'' || substr(_signature, 1, 22)) THEN';
  _new text := 'IF decode(_expected_signature, ''hex'') IS DISTINCT FROM decode(_signature, ''hex'') THEN';
BEGIN
  SELECT pg_get_functiondef('public.record_parser_runtime_attestation(text,jsonb,text,text,jsonb)'::regprocedure)
  INTO _definition;

  IF _definition IS NULL OR strpos(_definition, _old) = 0 THEN
    RAISE EXCEPTION 'PARSER_ATTESTATION_SIGNATURE_COMPARISON_NOT_FOUND';
  END IF;

  EXECUTE replace(_definition, _old, _new);
END;
$$;
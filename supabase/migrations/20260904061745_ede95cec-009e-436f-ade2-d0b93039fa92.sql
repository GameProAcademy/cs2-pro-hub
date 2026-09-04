-- Phase 2.1.2.2 — make public.jsonb_has_sensitive_key recursive.
-- Same name, same signature, same normalisation semantics and same forbidden
-- key/fragment lists as before; the only change is that nested objects and
-- arrays are now inspected at any depth. No table, RLS, grant or trigger
-- change: guard_connection_status() keeps calling this very function.
CREATE OR REPLACE FUNCTION public.jsonb_has_sensitive_key(_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  _k text;
  _v jsonb;
  _nk text;
BEGIN
  IF _value IS NULL THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(_value) = 'array' THEN
    FOR _v IN SELECT value FROM jsonb_array_elements(_value) LOOP
      IF public.jsonb_has_sensitive_key(_v) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;

  IF jsonb_typeof(_value) <> 'object' THEN
    RETURN false;
  END IF;

  FOR _k, _v IN SELECT key, value FROM jsonb_each(_value) LOOP
    _nk := regexp_replace(lower(_k), '[^a-z0-9]', '', 'g');
    IF _nk IN ('accesstoken','refreshtoken','idtoken','token','tokens','apikey','apisecret',
               'clientsecret','clientid','secret','secrets','authorization','auth','cookie',
               'cookies','session','sessionid','password','passwd','bearer','credential',
               'credentials','privatekey','publickey','signature','jwt','otp','pin')
       OR _nk LIKE '%token%' OR _nk LIKE '%secret%' OR _nk LIKE '%password%'
       OR _nk LIKE '%cookie%' OR _nk LIKE '%credential%' OR _nk LIKE '%apikey%'
       OR _nk LIKE '%privatekey%' OR _nk LIKE '%bearer%' OR _nk LIKE '%authorization%' THEN
      RETURN true;
    END IF;

    IF jsonb_typeof(_v) IN ('object','array') AND public.jsonb_has_sensitive_key(_v) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.jsonb_has_sensitive_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jsonb_has_sensitive_key(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.jsonb_has_sensitive_key(jsonb) FROM authenticated;
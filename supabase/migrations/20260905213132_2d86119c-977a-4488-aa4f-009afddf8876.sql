-- FASE 2.4.1C — reconciliation of the 2026-09-05 18:07 migration that was applied
-- to the database but never versioned in the repository. Recovered from the
-- Supabase migration history; every statement is idempotent.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.player_profile_roles FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.player_profile_goals FROM authenticated;
REVOKE ALL ON public.player_profile_roles FROM anon;
REVOKE ALL ON public.player_profile_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profile_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profile_goals TO authenticated;
GRANT ALL ON public.player_profile_roles TO service_role;
GRANT ALL ON public.player_profile_goals TO service_role;

CREATE OR REPLACE FUNCTION public.iso_alpha2_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY[
'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
'DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET',
'FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
'HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
'JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM',
'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW',
'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
'UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'
]::text[] $$;

REVOKE ALL ON FUNCTION public.iso_alpha2_codes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.iso_alpha2_codes() FROM anon;
GRANT EXECUTE ON FUNCTION public.iso_alpha2_codes() TO authenticated, service_role;
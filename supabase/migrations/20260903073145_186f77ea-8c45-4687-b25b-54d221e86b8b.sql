-- =====================================================================
-- PROMPT 07 — Final security hardening (grants, RLS, integrity)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GRANTS: reset and re-issue the minimum required privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Public catalogue: read-only for everyone.
GRANT SELECT ON public.skills, public.skill_translations, public.lessons,
                public.lesson_translations, public.lesson_skills TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skills, public.skill_translations,
      public.lessons, public.lesson_translations, public.lesson_skills TO authenticated;

-- Own account data.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.player_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_identities TO authenticated;

-- Uploads: create + read only; processing state stays backend-controlled.
GRANT SELECT, INSERT ON public.uploads TO authenticated;

-- Generated analytical data: read-only for signed-in users.
GRANT SELECT ON public.matches, public.match_metrics, public.analyses,
      public.analysis_findings, public.player_dna_snapshots,
      public.player_score_snapshots, public.training_plans,
      public.training_plan_items TO authenticated;

-- Coach: conversations are owned by the player; messages are append-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_conversations TO authenticated;
GRANT SELECT, INSERT ON public.coach_messages TO authenticated;

-- Audit log: append-only, administrator reads only (enforced by RLS).
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;

-- Roles table: read-only (own role); administration happens through the backend.
GRANT SELECT ON public.user_roles TO authenticated;

-- Backend/service role keeps full access.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------
-- 2. SECURITY DEFINER hardening: empty search_path + qualified names
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, nickname, country, locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1)),
    NEW.raw_user_meta_data->>'nickname',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'locale','en')
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.player_profiles (user_id, nickname, country, main_platform, current_level, competitive_goal)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'nickname',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'main_platform',
    NEW.raw_user_meta_data->>'current_level',
    NEW.raw_user_meta_data->>'competitive_goal'
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, NEW.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $function$;

-- Primary administrator protection (email binding + real UUID binding through
-- the existing role row): cannot be deleted, deactivated, demoted or replaced.
CREATE OR REPLACE FUNCTION public.protect_primary_admin_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(COALESCE(OLD.email,'')) = 'ia@gamepro.academy'
       OR OLD.role = 'admin_master' THEN
      RAISE EXCEPTION 'The primary administrator cannot be removed' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF lower(COALESCE(OLD.email,'')) = 'ia@gamepro.academy' OR OLD.role = 'admin_master' THEN
    -- Never demoted, never deactivated, email never reassigned.
    NEW.role := 'admin_master';
    NEW.status := 'active';
    NEW.email := OLD.email;
  ELSIF NEW.role IN ('admin','admin_master') AND OLD.role NOT IN ('admin','admin_master') THEN
    -- Single-administrator product: nobody else may become an administrator.
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.protect_primary_admin_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin_master' THEN
      RAISE EXCEPTION 'The primary administrator role cannot be removed' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.role IN ('admin','admin_master') AND NOT public.is_primary_admin(NEW.user_id) THEN
    RAISE EXCEPTION 'Additional administrators are not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

-- Exactly one admin_master row can ever exist.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_admin_master
  ON public.user_roles ((role)) WHERE role = 'admin_master';

-- Sensitive helpers must never be callable by anonymous visitors.
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_analysis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_conversation(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. player_identities: verification is backend/admin controlled
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_identity_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR public.is_admin_master(actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
  ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'Identity verification cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.guard_identity_verification() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS player_identities_guard_verification ON public.player_identities;
CREATE TRIGGER player_identities_guard_verification
  BEFORE INSERT OR UPDATE ON public.player_identities
  FOR EACH ROW EXECUTE FUNCTION public.guard_identity_verification();

-- ---------------------------------------------------------------------
-- 4. coach_messages: players may only author their own messages
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS coach_messages_rw ON public.coach_messages;

CREATE POLICY coach_messages_select_own ON public.coach_messages
  FOR SELECT TO authenticated
  USING (public.owns_conversation(conversation_id) OR public.is_admin_master(auth.uid()));

CREATE POLICY coach_messages_insert_player ON public.coach_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_conversation(conversation_id) AND role = 'player'::public.coach_role);

CREATE POLICY coach_messages_master_manage ON public.coach_messages
  FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Avatar storage: exact private path per user ({uid}/avatar.webp)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;

CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name = (auth.uid())::text || '/avatar.webp');

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name = (auth.uid())::text || '/avatar.webp')
  WITH CHECK (bucket_id = 'avatars' AND name = (auth.uid())::text || '/avatar.webp');

-- ---------------------------------------------------------------------
-- 6. Data integrity constraints (verified against existing rows)
-- ---------------------------------------------------------------------
ALTER TABLE public.player_score_snapshots
  DROP CONSTRAINT IF EXISTS player_score_snapshots_ranges_check,
  ADD CONSTRAINT player_score_snapshots_ranges_check CHECK (
    score BETWEEN 0 AND 100
    AND (percentile IS NULL OR percentile BETWEEN 0 AND 100));

ALTER TABLE public.analyses
  DROP CONSTRAINT IF EXISTS analyses_confidence_check,
  ADD CONSTRAINT analyses_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);

ALTER TABLE public.analysis_findings
  DROP CONSTRAINT IF EXISTS analysis_findings_confidence_check,
  ADD CONSTRAINT analysis_findings_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);

ALTER TABLE public.player_dna_snapshots
  DROP CONSTRAINT IF EXISTS player_dna_snapshots_ranges_check,
  ADD CONSTRAINT player_dna_snapshots_ranges_check CHECK (
    (aim IS NULL OR aim BETWEEN 0 AND 100)
    AND (dueling IS NULL OR dueling BETWEEN 0 AND 100)
    AND (survivability IS NULL OR survivability BETWEEN 0 AND 100)
    AND (positioning IS NULL OR positioning BETWEEN 0 AND 100)
    AND (utility IS NULL OR utility BETWEEN 0 AND 100)
    AND (decision_making IS NULL OR decision_making BETWEEN 0 AND 100)
    AND (teamplay IS NULL OR teamplay BETWEEN 0 AND 100)
    AND (economy IS NULL OR economy BETWEEN 0 AND 100)
    AND (clutch IS NULL OR clutch BETWEEN 0 AND 100)
    AND (consistency IS NULL OR consistency BETWEEN 0 AND 100));

ALTER TABLE public.match_metrics
  DROP CONSTRAINT IF EXISTS match_metrics_ranges_check,
  ADD CONSTRAINT match_metrics_ranges_check CHECK (
    (kills IS NULL OR kills >= 0)
    AND (deaths IS NULL OR deaths >= 0)
    AND (assists IS NULL OR assists >= 0)
    AND (first_kills IS NULL OR first_kills >= 0)
    AND (first_deaths IS NULL OR first_deaths >= 0)
    AND (clutches IS NULL OR clutches >= 0)
    AND (multi_kills IS NULL OR multi_kills >= 0)
    AND (flash_assists IS NULL OR flash_assists >= 0)
    AND (adr IS NULL OR adr >= 0)
    AND (utility_damage IS NULL OR utility_damage >= 0)
    AND (grenade_damage IS NULL OR grenade_damage >= 0)
    AND (kast IS NULL OR kast BETWEEN 0 AND 100)
    AND (hs_percent IS NULL OR hs_percent BETWEEN 0 AND 100)
    AND (opening_success IS NULL OR opening_success BETWEEN 0 AND 100)
    AND (rating IS NULL OR rating >= 0)
    AND (ct_rating IS NULL OR ct_rating >= 0)
    AND (t_rating IS NULL OR t_rating >= 0));

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_scores_check,
  ADD CONSTRAINT matches_scores_check CHECK (
    (rounds IS NULL OR rounds >= 0)
    AND (score_player IS NULL OR score_player >= 0)
    AND (score_opponent IS NULL OR score_opponent >= 0));

ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_file_size_check,
  ADD CONSTRAINT uploads_file_size_check CHECK (file_size IS NULL OR file_size >= 0);

-- ---------------------------------------------------------------------
-- 7. Foreign-key indexes (and removal of one duplicate)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS analyses_source_upload_idx ON public.analyses (source_upload_id);
CREATE INDEX IF NOT EXISTS analysis_findings_skill_idx ON public.analysis_findings (skill_id);
CREATE INDEX IF NOT EXISTS matches_upload_idx ON public.matches (upload_id);
CREATE INDEX IF NOT EXISTS player_dna_snapshots_analysis_idx ON public.player_dna_snapshots (analysis_id);
CREATE INDEX IF NOT EXISTS player_score_snapshots_analysis_idx ON public.player_score_snapshots (analysis_id);
CREATE INDEX IF NOT EXISTS training_plan_items_lesson_idx ON public.training_plan_items (lesson_id);
CREATE INDEX IF NOT EXISTS training_plan_items_skill_idx ON public.training_plan_items (skill_id);
CREATE INDEX IF NOT EXISTS training_plans_analysis_idx ON public.training_plans (analysis_id);
DROP INDEX IF EXISTS public.admin_audit_logs_created_at_idx;
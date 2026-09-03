-- =========================================================
-- 1. Definitive role model: admin_master is the only operational admin.
--    The enum value 'admin' is kept for historical compatibility only
--    (removing an enum value is destructive) but is no longer recognised.
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin_master'); $$;

-- =========================================================
-- 2. profiles: extend the column guard to technical/administrative fields.
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  is_master boolean := false;
BEGIN
  IF actor IS NOT NULL THEN
    is_master := public.is_admin_master(actor);
  END IF;

  IF actor IS NOT NULL AND NOT is_master THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Changing the account role is not allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Changing the account status is not allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Changing the account email is not allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Changing the account creation date is not allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
      RAISE EXCEPTION 'Changing the last login timestamp is not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $$;

-- =========================================================
-- 3. System-generated analytical data: read-own, admin-manage.
--    Writes will come from the backend pipeline (service_role bypasses RLS).
-- =========================================================
DROP POLICY IF EXISTS matches_rw ON public.matches;
CREATE POLICY matches_select_own ON public.matches FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
CREATE POLICY matches_admin_manage ON public.matches FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS match_metrics_rw ON public.match_metrics;
CREATE POLICY match_metrics_select_own ON public.match_metrics FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
CREATE POLICY match_metrics_admin_manage ON public.match_metrics FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS analyses_rw ON public.analyses;
CREATE POLICY analyses_select_own ON public.analyses FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
CREATE POLICY analyses_admin_manage ON public.analyses FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS analysis_findings_rw ON public.analysis_findings;
CREATE POLICY analysis_findings_select_own ON public.analysis_findings FOR SELECT TO authenticated
  USING (public.owns_analysis(analysis_id) OR public.is_staff(auth.uid()));
CREATE POLICY analysis_findings_admin_manage ON public.analysis_findings FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS dna_snapshots_rw ON public.player_dna_snapshots;
CREATE POLICY dna_snapshots_select_own ON public.player_dna_snapshots FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
CREATE POLICY dna_snapshots_admin_manage ON public.player_dna_snapshots FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS score_snapshots_rw ON public.player_score_snapshots;
CREATE POLICY score_snapshots_select_own ON public.player_score_snapshots FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
CREATE POLICY score_snapshots_admin_manage ON public.player_score_snapshots FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS training_plans_rw ON public.training_plans;
CREATE POLICY training_plans_select_own ON public.training_plans FOR SELECT TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()));
CREATE POLICY training_plans_admin_manage ON public.training_plans FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS training_plan_items_rw ON public.training_plan_items;
CREATE POLICY training_plan_items_select_own ON public.training_plan_items FOR SELECT TO authenticated
  USING (public.owns_plan(training_plan_id) OR public.is_staff(auth.uid()));
CREATE POLICY training_plan_items_admin_manage ON public.training_plan_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Players may not change generated data: revoke write privileges entirely.
REVOKE INSERT, UPDATE, DELETE ON public.matches, public.match_metrics, public.analyses,
  public.analysis_findings, public.player_dna_snapshots, public.player_score_snapshots,
  public.training_plans, public.training_plan_items FROM authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matches, public.match_metrics, public.analyses,
  public.analysis_findings, public.player_dna_snapshots, public.player_score_snapshots,
  public.training_plans, public.training_plan_items TO service_role;

-- =========================================================
-- 4. uploads: the start of the future parser pipeline.
--    Player: create + read own. Pipeline fields are backend-controlled.
-- =========================================================
DROP POLICY IF EXISTS uploads_rw ON public.uploads;
CREATE POLICY uploads_select_own ON public.uploads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY uploads_insert_own ON public.uploads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND processed_at IS NULL AND error_message IS NULL);
CREATE POLICY uploads_admin_manage ON public.uploads FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

REVOKE UPDATE, DELETE ON public.uploads FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO service_role;

-- =========================================================
-- 5. admin_audit_logs: administrator-only, append-only.
-- =========================================================
DROP POLICY IF EXISTS admin_audit_logs_select ON public.admin_audit_logs;
DROP POLICY IF EXISTS admin_audit_logs_insert ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_select ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin_master(auth.uid()));
CREATE POLICY admin_audit_logs_insert ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_master(auth.uid()) AND admin_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_idx ON public.admin_audit_logs (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_user_idx ON public.admin_audit_logs (admin_user_id, created_at DESC);

-- =========================================================
-- 6. user_roles: no anonymous/public API access.
-- =========================================================
REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- =========================================================
-- 7. skill_translations: contextual CS2 terminology, 10 skills x 5 locales.
-- =========================================================
WITH t(slug, locale, name) AS (VALUES
  ('aim','pt-BR','Mira'),('aim','en','Aim'),('aim','es','Puntería'),('aim','fr','Visée'),('aim','pt-PT','Mira'),
  ('dueling','pt-BR','Duelos'),('dueling','en','Dueling'),('dueling','es','Duelos'),('dueling','fr','Duels'),('dueling','pt-PT','Duelos'),
  ('survivability','pt-BR','Sobrevivência'),('survivability','en','Survivability'),('survivability','es','Supervivencia'),('survivability','fr','Survie'),('survivability','pt-PT','Sobrevivência'),
  ('positioning','pt-BR','Posicionamento'),('positioning','en','Positioning'),('positioning','es','Posicionamiento'),('positioning','fr','Placement'),('positioning','pt-PT','Posicionamento'),
  ('utility','pt-BR','Utilitário'),('utility','en','Utility'),('utility','es','Utilidad'),('utility','fr','Utilitaires'),('utility','pt-PT','Utilitários'),
  ('decision_making','pt-BR','Tomada de decisão'),('decision_making','en','Decision Making'),('decision_making','es','Toma de decisiones'),('decision_making','fr','Prise de décision'),('decision_making','pt-PT','Tomada de decisão'),
  ('teamplay','pt-BR','Trabalho em equipe'),('teamplay','en','Teamplay'),('teamplay','es','Juego en equipo'),('teamplay','fr','Jeu en équipe'),('teamplay','pt-PT','Trabalho em equipa'),
  ('economy','pt-BR','Economia'),('economy','en','Economy'),('economy','es','Economía'),('economy','fr','Économie'),('economy','pt-PT','Economia'),
  ('clutch','pt-BR','Clutch'),('clutch','en','Clutch'),('clutch','es','Clutch'),('clutch','fr','Clutch'),('clutch','pt-PT','Clutch'),
  ('consistency','pt-BR','Consistência'),('consistency','en','Consistency'),('consistency','es','Consistencia'),('consistency','fr','Régularité'),('consistency','pt-PT','Consistência')
)
INSERT INTO public.skill_translations (skill_id, locale, name)
SELECT s.id, t.locale, t.name FROM t JOIN public.skills s ON s.slug = t.slug
ON CONFLICT (skill_id, locale) DO UPDATE SET name = EXCLUDED.name;

-- =========================================================
-- 8. Avatar storage policies (private bucket "avatars").
--    Path convention: avatars/{user_id}/<file>. Owner-only writes.
-- =========================================================
DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin_master(auth.uid())));
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
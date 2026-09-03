-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin_master','admin','player');
CREATE TYPE public.user_status AS ENUM ('active','inactive');
CREATE TYPE public.platform_kind AS ENUM ('FACEIT','GAMERS_CLUB','STEAM');
CREATE TYPE public.upload_type AS ENUM ('demo','screenshot','report');
CREATE TYPE public.upload_source AS ENUM ('manual','faceit','gamers_club','steam');
CREATE TYPE public.upload_status AS ENUM ('pending','processing','processed','failed');
CREATE TYPE public.match_result AS ENUM ('win','loss','draw');
CREATE TYPE public.analysis_status AS ENUM ('pending','processing','completed','failed');
CREATE TYPE public.finding_type AS ENUM ('bottleneck','strength','recommendation');
CREATE TYPE public.finding_priority AS ENUM ('critical','high','medium','low');
CREATE TYPE public.plan_status AS ENUM ('draft','active','completed','archived');
CREATE TYPE public.plan_item_status AS ENUM ('pending','in_progress','done','skipped');
CREATE TYPE public.coach_role AS ENUM ('coach','player');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  country TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  role public.app_role NOT NULL DEFAULT 'player',
  status public.user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX profiles_role_idx ON public.profiles(role);
CREATE INDEX profiles_status_idx ON public.profiles(status);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX user_roles_user_idx ON public.user_roles(user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','admin_master'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin_master');
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin_master(auth.uid()) THEN
    NEW.role := OLD.role;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_guard_role BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();

CREATE OR REPLACE FUNCTION public.sync_user_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, NEW.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_sync_roles AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_roles();

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_staff(auth.uid()));

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY user_roles_master_manage ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));

-- ============ PLAYER PROFILES ============
CREATE TABLE public.player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname TEXT,
  country TEXT,
  main_platform TEXT,
  current_level TEXT,
  competitive_goal TEXT,
  role TEXT,
  experience TEXT,
  team TEXT,
  faceit_username TEXT,
  faceit_player_id TEXT,
  gamersclub_username TEXT,
  gamersclub_player_id TEXT,
  steam_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER player_profiles_touch BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profiles TO authenticated;
GRANT ALL ON public.player_profiles TO service_role;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_profiles_rw ON public.player_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.owns_player(_player_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.player_profiles WHERE id = _player_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ IDENTITIES ============
CREATE TABLE public.player_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  platform public.platform_kind NOT NULL,
  external_id TEXT,
  username TEXT,
  profile_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, platform)
);
CREATE TRIGGER player_identities_touch BEFORE UPDATE ON public.player_identities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_identities TO authenticated;
GRANT ALL ON public.player_identities TO service_role;
ALTER TABLE public.player_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_identities_rw ON public.player_identities FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

-- ============ UPLOADS ============
CREATE TABLE public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.upload_type NOT NULL,
  source public.upload_source NOT NULL DEFAULT 'manual',
  file_name TEXT NOT NULL,
  storage_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  status public.upload_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX uploads_user_idx ON public.uploads(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO authenticated;
GRANT ALL ON public.uploads TO service_role;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY uploads_rw ON public.uploads FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- ============ MATCHES / METRICS ============
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES public.uploads(id) ON DELETE SET NULL,
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  platform TEXT,
  external_match_id TEXT,
  map TEXT,
  match_date TIMESTAMPTZ,
  score_player INTEGER,
  score_opponent INTEGER,
  result public.match_result,
  rounds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, platform, external_match_id)
);
CREATE INDEX matches_player_idx ON public.matches(player_id, match_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY matches_rw ON public.matches FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE TABLE public.match_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  kills INTEGER, deaths INTEGER, assists INTEGER,
  adr NUMERIC(6,2), kast NUMERIC(5,2), hs_percent NUMERIC(5,2),
  first_kills INTEGER, first_deaths INTEGER, opening_success NUMERIC(5,2),
  clutches INTEGER, multi_kills INTEGER,
  utility_damage NUMERIC(8,2), flash_assists INTEGER, grenade_damage NUMERIC(8,2),
  ct_rating NUMERIC(5,2), t_rating NUMERIC(5,2), rating NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);
CREATE INDEX match_metrics_player_idx ON public.match_metrics(player_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_metrics TO authenticated;
GRANT ALL ON public.match_metrics TO service_role;
ALTER TABLE public.match_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_metrics_rw ON public.match_metrics FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

-- ============ SKILLS ============
CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.skills TO authenticated, anon;
GRANT ALL ON public.skills TO service_role;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY skills_read ON public.skills FOR SELECT USING (true);
CREATE POLICY skills_master ON public.skills FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));

CREATE TABLE public.skill_translations (
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (skill_id, locale)
);
GRANT SELECT ON public.skill_translations TO authenticated, anon;
GRANT ALL ON public.skill_translations TO service_role;
ALTER TABLE public.skill_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_translations_read ON public.skill_translations FOR SELECT USING (true);
CREATE POLICY skill_translations_master ON public.skill_translations FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));

-- ============ ANALYSES ============
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  source_upload_id UUID REFERENCES public.uploads(id) ON DELETE SET NULL,
  analysis_version TEXT NOT NULL DEFAULT 'v0',
  confidence NUMERIC(5,2),
  status public.analysis_status NOT NULL DEFAULT 'pending',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analyses_player_idx ON public.analyses(player_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY analyses_rw ON public.analyses FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.owns_analysis(_analysis_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.analyses a
    JOIN public.player_profiles p ON p.id = a.player_id
    WHERE a.id = _analysis_id AND p.user_id = auth.uid()
  );
$$;

CREATE TABLE public.analysis_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  type public.finding_type NOT NULL,
  priority public.finding_priority,
  impact TEXT,
  confidence NUMERIC(5,2),
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analysis_findings_analysis_idx ON public.analysis_findings(analysis_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_findings TO authenticated;
GRANT ALL ON public.analysis_findings TO service_role;
ALTER TABLE public.analysis_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_findings_rw ON public.analysis_findings FOR ALL TO authenticated
  USING (public.owns_analysis(analysis_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_analysis(analysis_id) OR public.is_staff(auth.uid()));

-- ============ SNAPSHOTS ============
CREATE TABLE public.player_dna_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
  aim NUMERIC(5,2), dueling NUMERIC(5,2), survivability NUMERIC(5,2),
  positioning NUMERIC(5,2), utility NUMERIC(5,2), decision_making NUMERIC(5,2),
  teamplay NUMERIC(5,2), economy NUMERIC(5,2), clutch NUMERIC(5,2), consistency NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dna_snapshots_player_idx ON public.player_dna_snapshots(player_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_dna_snapshots TO authenticated;
GRANT ALL ON public.player_dna_snapshots TO service_role;
ALTER TABLE public.player_dna_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY dna_snapshots_rw ON public.player_dna_snapshots FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE TABLE public.player_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
  score NUMERIC(6,2) NOT NULL,
  percentile NUMERIC(5,2),
  tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX score_snapshots_player_idx ON public.player_score_snapshots(player_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_score_snapshots TO authenticated;
GRANT ALL ON public.player_score_snapshots TO service_role;
ALTER TABLE public.player_score_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY score_snapshots_rw ON public.player_score_snapshots FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

-- ============ LESSONS ============
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  module TEXT,
  lesson_url TEXT,
  duration TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.lessons TO authenticated, anon;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY lessons_read ON public.lessons FOR SELECT USING (true);
CREATE POLICY lessons_staff ON public.lessons FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.lesson_translations (
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (lesson_id, locale)
);
GRANT SELECT ON public.lesson_translations TO authenticated, anon;
GRANT ALL ON public.lesson_translations TO service_role;
ALTER TABLE public.lesson_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_translations_read ON public.lesson_translations FOR SELECT USING (true);
CREATE POLICY lesson_translations_staff ON public.lesson_translations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.lesson_skills (
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, skill_id)
);
GRANT SELECT ON public.lesson_skills TO authenticated, anon;
GRANT ALL ON public.lesson_skills TO service_role;
ALTER TABLE public.lesson_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_skills_read ON public.lesson_skills FOR SELECT USING (true);
CREATE POLICY lesson_skills_staff ON public.lesson_skills FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ TRAINING ============
CREATE TABLE public.training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
  horizon SMALLINT NOT NULL CHECK (horizon IN (30,60,90)),
  status public.plan_status NOT NULL DEFAULT 'draft',
  title TEXT,
  objective TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX training_plans_player_idx ON public.training_plans(player_id, horizon);
CREATE TRIGGER training_plans_touch BEFORE UPDATE ON public.training_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plans TO authenticated;
GRANT ALL ON public.training_plans TO service_role;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_plans_rw ON public.training_plans FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.owns_plan(_plan_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.training_plans tp
    JOIN public.player_profiles p ON p.id = tp.player_id
    WHERE tp.id = _plan_id AND p.user_id = auth.uid()
  );
$$;

CREATE TABLE public.training_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_metric TEXT,
  target_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status public.plan_item_status NOT NULL DEFAULT 'pending'
);
CREATE INDEX training_plan_items_plan_idx ON public.training_plan_items(training_plan_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plan_items TO authenticated;
GRANT ALL ON public.training_plan_items TO service_role;
ALTER TABLE public.training_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_plan_items_rw ON public.training_plan_items FOR ALL TO authenticated
  USING (public.owns_plan(training_plan_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_plan(training_plan_id) OR public.is_staff(auth.uid()));

-- ============ COACH ============
CREATE TABLE public.coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_conversations_player_idx ON public.coach_conversations(player_id, updated_at DESC);
CREATE TRIGGER coach_conversations_touch BEFORE UPDATE ON public.coach_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_conversations TO authenticated;
GRANT ALL ON public.coach_conversations TO service_role;
ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_conversations_rw ON public.coach_conversations FOR ALL TO authenticated
  USING (public.owns_player(player_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_player(player_id) OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.owns_conversation(_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_conversations c
    JOIN public.player_profiles p ON p.id = c.player_id
    WHERE c.id = _conversation_id AND p.user_id = auth.uid()
  );
$$;

CREATE TABLE public.coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  role public.coach_role NOT NULL,
  content TEXT NOT NULL,
  context_type TEXT,
  context_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_messages_conversation_idx ON public.coach_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_messages TO authenticated;
GRANT ALL ON public.coach_messages TO service_role;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_messages_rw ON public.coach_messages FOR ALL TO authenticated
  USING (public.owns_conversation(conversation_id) OR public.is_staff(auth.uid()))
  WITH CHECK (public.owns_conversation(conversation_id) OR public.is_staff(auth.uid()));

-- ============ AUDIT ============
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_audit_logs_select ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY admin_audit_logs_insert ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND admin_user_id = auth.uid());

-- ============ SEED: skills + translations ============
INSERT INTO public.skills (slug, sort_order) VALUES
  ('aim',1),('dueling',2),('survivability',3),('positioning',4),('utility',5),
  ('decision_making',6),('teamplay',7),('economy',8),('clutch',9),('consistency',10);

INSERT INTO public.skill_translations (skill_id, locale, name)
SELECT s.id, v.locale, v.name FROM public.skills s
JOIN (VALUES
  ('aim','pt-BR','Mira'),('aim','pt-PT','Mira'),('aim','en','Aim'),('aim','es','Puntería'),('aim','fr','Visée'),
  ('dueling','pt-BR','Duelos'),('dueling','pt-PT','Duelos'),('dueling','en','Dueling'),('dueling','es','Duelos'),('dueling','fr','Duels'),
  ('survivability','pt-BR','Sobrevivência'),('survivability','pt-PT','Sobrevivência'),('survivability','en','Survivability'),('survivability','es','Supervivencia'),('survivability','fr','Survie'),
  ('positioning','pt-BR','Posicionamento'),('positioning','pt-PT','Posicionamento'),('positioning','en','Positioning'),('positioning','es','Posicionamiento'),('positioning','fr','Positionnement'),
  ('utility','pt-BR','Utilitários'),('utility','pt-PT','Utilitários'),('utility','en','Utility'),('utility','es','Utilidad'),('utility','fr','Utilitaires'),
  ('decision_making','pt-BR','Tomada de decisão'),('decision_making','pt-PT','Tomada de decisão'),('decision_making','en','Decision Making'),('decision_making','es','Toma de decisiones'),('decision_making','fr','Prise de décision'),
  ('teamplay','pt-BR','Teamplay'),('teamplay','pt-PT','Teamplay'),('teamplay','en','Teamplay'),('teamplay','es','Teamplay'),('teamplay','fr','Teamplay'),
  ('economy','pt-BR','Economia'),('economy','pt-PT','Economia'),('economy','en','Economy'),('economy','es','Economía'),('economy','fr','Économie'),
  ('clutch','pt-BR','Clutch'),('clutch','pt-PT','Clutch'),('clutch','en','Clutch'),('clutch','es','Clutch'),('clutch','fr','Clutch'),
  ('consistency','pt-BR','Consistência'),('consistency','pt-PT','Consistência'),('consistency','en','Consistency'),('consistency','es','Consistencia'),('consistency','fr','Constance')
) AS v(slug, locale, name) ON v.slug = s.slug;

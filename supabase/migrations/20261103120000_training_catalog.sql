-- Training catalog: single source of truth for GamePro courses and lessons (5 locales, 3 tracks).
--
-- Read by the Training plan and the AI Coach (only active, language-confirmed, classified
-- items); written only by the admin_master (RLS) through the admin catalog screen or the
-- documented import (docs/TRAINING_CATALOG.md). Rows carry stable UUIDs and stable keys
-- (`course:<slug>`, `lesson:<course-slug>/<lesson-slug>`) so a URL or title change keeps
-- every association. Additive only: no existing table, row, policy or grant is changed.
-- The legacy empty `lessons` / `lesson_translations` scaffold is left untouched.
BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_url_ok(_url text, _kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT _url IS NOT NULL
     AND pg_catalog.strpos(pg_catalog.lower(_url), 'sample-course') = 0
     AND CASE _kind
           WHEN 'course' THEN _url ~ '^https://hub\.gamepro\.academy/courses/[a-z0-9-]+/$'
           WHEN 'lesson' THEN _url ~ '^https://hub\.gamepro\.academy/courses/[a-z0-9-]+/lessons/[a-z0-9-]+/$'
           ELSE false
         END
$$;

CREATE TABLE public.catalog_content_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_:-]{1,80}$'),
  track text NOT NULL CHECK (track IN ('counter_strike_in_game','strategic_knowledge','extra_skills','unclassified')),
  track_source text NOT NULL DEFAULT 'import' CHECK (track_source IN ('import','content_review','admin')),
  topics text[] NOT NULL DEFAULT '{}',
  summary text CHECK (summary IS NULL OR length(summary) <= 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^course:[a-z0-9-]{1,120}$'),
  group_id uuid NOT NULL REFERENCES public.catalog_content_groups(id) ON DELETE RESTRICT,
  family_slug text NOT NULL,
  slug text NOT NULL UNIQUE,
  locale text NOT NULL CHECK (locale IN ('pt-BR','pt-PT','en','es','fr')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  url text NOT NULL UNIQUE CHECK (public.catalog_url_ok(url, 'course')),
  summary text CHECK (summary IS NULL OR length(summary) <= 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_courses_group_locale_idx ON public.catalog_courses(group_id, locale);

CREATE TABLE public.catalog_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^lesson:[a-z0-9-]{1,120}/[a-z0-9-]{1,160}$'),
  group_id uuid NOT NULL REFERENCES public.catalog_content_groups(id) ON DELETE RESTRICT,
  course_id uuid REFERENCES public.catalog_courses(id) ON DELETE SET NULL,
  family_slug text NOT NULL,
  course_slug text NOT NULL,
  locale text CHECK (locale IS NULL OR locale IN ('pt-BR','pt-PT','en','es','fr')),
  language_status text NOT NULL CHECK (language_status IN ('confirmed','pending')),
  language_evidence text NOT NULL CHECK (length(language_evidence) BETWEEN 1 AND 60),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  url text NOT NULL UNIQUE CHECK (public.catalog_url_ok(url, 'lesson')),
  position integer CHECK (position IS NULL OR position BETWEEN 0 AND 999),
  topics text[] NOT NULL DEFAULT '{}',
  summary text CHECK (summary IS NULL OR length(summary) <= 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A confirmed language always names its locale.
  CONSTRAINT catalog_lessons_confirmed_has_locale CHECK (language_status <> 'confirmed' OR locale IS NOT NULL)
);
CREATE INDEX catalog_lessons_pick_idx ON public.catalog_lessons(locale, language_status, active);
CREATE INDEX catalog_lessons_topics_idx ON public.catalog_lessons USING gin (topics);
CREATE INDEX catalog_lessons_group_idx ON public.catalog_lessons(group_id);
CREATE INDEX catalog_lessons_course_idx ON public.catalog_lessons(course_id);

CREATE TABLE public.catalog_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 200),
  dry_run boolean NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER catalog_content_groups_touch BEFORE UPDATE ON public.catalog_content_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER catalog_courses_touch BEFORE UPDATE ON public.catalog_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER catalog_lessons_touch BEFORE UPDATE ON public.catalog_lessons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Access: any signed-in user reads active rows (inactive rows only for the admin);
-- only the admin_master writes. anon has no access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_content_groups, public.catalog_courses,
  public.catalog_lessons TO authenticated;
GRANT SELECT, INSERT ON public.catalog_import_runs TO authenticated;
GRANT ALL ON public.catalog_content_groups, public.catalog_courses, public.catalog_lessons,
  public.catalog_import_runs TO service_role;

ALTER TABLE public.catalog_content_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_groups_read ON public.catalog_content_groups FOR SELECT TO authenticated
  USING (active OR public.is_admin_master(auth.uid()));
CREATE POLICY catalog_groups_admin ON public.catalog_content_groups FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY catalog_courses_read ON public.catalog_courses FOR SELECT TO authenticated
  USING (active OR public.is_admin_master(auth.uid()));
CREATE POLICY catalog_courses_admin ON public.catalog_courses FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY catalog_lessons_read ON public.catalog_lessons FOR SELECT TO authenticated
  USING (active OR public.is_admin_master(auth.uid()));
CREATE POLICY catalog_lessons_admin ON public.catalog_lessons FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY catalog_import_runs_admin ON public.catalog_import_runs FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));

COMMIT;

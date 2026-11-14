-- PM6 B: correct the two Lovable security findings, minimally and idempotently.
--
-- 1. Public catalog (finding "access rules let everyone through", 5 tables).
--    lessons, skills, lesson_translations, skill_translations and lesson_skills had
--    `FOR SELECT USING (true)` for every role (20260903012041). lessons and skills carry a
--    NOT NULL `active` flag, so a deactivated lesson or skill (and its translations, its
--    lesson_url and its skill links) stayed readable by anonymous visitors. The public read
--    policies now expose only active rows; translations and links follow their parent. The
--    staff/master write policies (lessons_staff, lesson_skills_staff, lesson_translations_staff,
--    skills_master, skill_translations_master) are untouched, so staff still see everything.
--
-- 2. Forensic staging storage (finding "storage rules don't tie files to their owner",
--    3 policies). r5_forensic_staging_objects_master_{select,insert,update} (20260923015032)
--    let any admin_master read, create or overwrite the reference fixture regardless of who
--    owns the object. They now also require owner_id = auth.uid(): the uploader keeps the
--    browser resumable-upload path (src/lib/pipeline/r5ResumableUpload.ts); nobody else does.
--    The service_role policies used by the A9.1 workflow and the retention operator are
--    untouched. The bucket stays private and the object path stays pinned.
--
-- No row, grant, function, bucket or other policy changes. Re-running is a no-op.
BEGIN;

DROP POLICY IF EXISTS lessons_read ON public.lessons;
CREATE POLICY lessons_read ON public.lessons FOR SELECT USING (active);

DROP POLICY IF EXISTS skills_read ON public.skills;
CREATE POLICY skills_read ON public.skills FOR SELECT USING (active);

DROP POLICY IF EXISTS lesson_translations_read ON public.lesson_translations;
CREATE POLICY lesson_translations_read ON public.lesson_translations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_translations.lesson_id AND l.active)
);

DROP POLICY IF EXISTS skill_translations_read ON public.skill_translations;
CREATE POLICY skill_translations_read ON public.skill_translations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.skills s WHERE s.id = skill_translations.skill_id AND s.active)
);

DROP POLICY IF EXISTS lesson_skills_read ON public.lesson_skills;
CREATE POLICY lesson_skills_read ON public.lesson_skills FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_skills.lesson_id AND l.active)
  AND EXISTS (SELECT 1 FROM public.skills s WHERE s.id = lesson_skills.skill_id AND s.active)
);

DROP POLICY IF EXISTS r5_forensic_staging_objects_master_select ON storage.objects;
CREATE POLICY r5_forensic_staging_objects_master_select
ON storage.objects FOR SELECT TO authenticated
USING (
  public.is_admin_master(auth.uid())
  AND owner_id = (auth.uid())::text
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

DROP POLICY IF EXISTS r5_forensic_staging_objects_master_insert ON storage.objects;
CREATE POLICY r5_forensic_staging_objects_master_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_master(auth.uid())
  AND owner_id = (auth.uid())::text
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

DROP POLICY IF EXISTS r5_forensic_staging_objects_master_update ON storage.objects;
CREATE POLICY r5_forensic_staging_objects_master_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  public.is_admin_master(auth.uid())
  AND owner_id = (auth.uid())::text
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
)
WITH CHECK (
  public.is_admin_master(auth.uid())
  AND owner_id = (auth.uid())::text
  AND bucket_id = 'r5-forensic-staging'
  AND name = 'cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem'
);

COMMIT;

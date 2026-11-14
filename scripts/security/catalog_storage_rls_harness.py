#!/usr/bin/env python3
"""PM6 B — disposable PostgreSQL proof of the catalog and storage RLS correction.

Builds a production-shaped stub (roles, auth.uid(), user_roles, is_staff, is_admin_master,
storage.buckets/objects with owner_id, and the public catalog tables) carrying the policies as
they exist in production before the fix (copied from the migrations that created them and from
pg_policies). It records the baseline behaviour, applies
supabase/migrations/20261114010000_pm6_security_catalog_active_forensic_owner.sql VERBATIM twice,
and checks the access matrix for anonymous, user A, user B, staff and two admin_master accounts
(the fixture owner and a second one). Prints JSON. `SECURITY_MIGRATION` overrides the migration
(mutation tests); `SECURITY_HARNESS_PG_USER` sets the OS user when run as root.
"""

from __future__ import annotations

import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = pathlib.Path(os.environ.get("SECURITY_MIGRATION") or
                         ROOT / "supabase/migrations/20261114010000_pm6_security_catalog_active_forensic_owner.sql")
FIXTURE = "cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d.dem"

SCHEMA = r"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_master(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin_master'); $$;
CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','admin_master')); $$;
GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid), public.is_staff(uuid) TO anon, authenticated, service_role;

-- Public catalog, policies as created by 20260903012041 and later migrations (pg_policies 2026-11-13).
CREATE TABLE public.lessons (id uuid PRIMARY KEY, slug text, module text, lesson_url text, duration text,
  sort_order integer, active boolean NOT NULL DEFAULT true);
CREATE TABLE public.skills (id uuid PRIMARY KEY, slug text, sort_order integer, active boolean NOT NULL DEFAULT true);
CREATE TABLE public.lesson_translations (lesson_id uuid REFERENCES public.lessons(id), locale text, title text, description text);
CREATE TABLE public.skill_translations (skill_id uuid REFERENCES public.skills(id), locale text, name text, description text);
CREATE TABLE public.lesson_skills (lesson_id uuid REFERENCES public.lessons(id), skill_id uuid REFERENCES public.skills(id));
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY lessons_read ON public.lessons FOR SELECT USING (true);
CREATE POLICY skills_read ON public.skills FOR SELECT USING (true);
CREATE POLICY lesson_translations_read ON public.lesson_translations FOR SELECT USING (true);
CREATE POLICY skill_translations_read ON public.skill_translations FOR SELECT USING (true);
CREATE POLICY lesson_skills_read ON public.lesson_skills FOR SELECT USING (true);
CREATE POLICY lessons_staff ON public.lessons FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY lesson_skills_staff ON public.lesson_skills FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY lesson_translations_staff ON public.lesson_translations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY skills_master ON public.skills FOR ALL TO authenticated USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY skill_translations_master ON public.skill_translations FOR ALL TO authenticated USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
GRANT SELECT ON public.lessons, public.skills, public.lesson_translations, public.skill_translations, public.lesson_skills TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lessons, public.skills, public.lesson_translations, public.skill_translations, public.lesson_skills TO authenticated;
GRANT ALL ON public.lessons, public.skills, public.lesson_translations, public.skill_translations, public.lesson_skills TO service_role;

-- Storage, policies as in pg_policies on 2026-11-13.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects (bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL,
  owner uuid, owner_id text, metadata jsonb, PRIMARY KEY (bucket_id, name));
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
CREATE POLICY demos_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'demos' AND (storage.foldername(name))[1] = (auth.uid())::text AND name LIKE '%.dem');
CREATE POLICY demos_select_own ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'demos' AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.is_staff(auth.uid())));
CREATE POLICY demos_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'demos' AND (storage.foldername(name))[1] = (auth.uid())::text AND name LIKE '%.dem')
  WITH CHECK (bucket_id = 'demos' AND (storage.foldername(name))[1] = (auth.uid())::text AND name LIKE '%.dem');
CREATE POLICY avatars_select_own ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'avatars' AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.is_admin_master(auth.uid())));
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'avatars' AND name = ((auth.uid())::text || '/avatar.webp'));
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'avatars' AND name = ((auth.uid())::text || '/avatar.webp'));
CREATE POLICY r5_forensic_staging_objects_master_select ON storage.objects FOR SELECT TO authenticated USING (
  public.is_admin_master(auth.uid()) AND bucket_id = 'r5-forensic-staging' AND name = '__FIXTURE__');
CREATE POLICY r5_forensic_staging_objects_master_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  public.is_admin_master(auth.uid()) AND bucket_id = 'r5-forensic-staging' AND name = '__FIXTURE__');
CREATE POLICY r5_forensic_staging_objects_master_update ON storage.objects FOR UPDATE TO authenticated
  USING (public.is_admin_master(auth.uid()) AND bucket_id = 'r5-forensic-staging' AND name = '__FIXTURE__')
  WITH CHECK (public.is_admin_master(auth.uid()) AND bucket_id = 'r5-forensic-staging' AND name = '__FIXTURE__');
CREATE POLICY r5_forensic_staging_objects_service_select ON storage.objects FOR SELECT TO service_role USING (
  bucket_id = 'r5-forensic-staging');
INSERT INTO storage.buckets VALUES ('demos', false), ('avatars', false), ('r5-forensic-staging', false);
""".replace("__FIXTURE__", FIXTURE)


def pg_bin(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in sorted(pathlib.Path("/usr/lib/postgresql").glob(f"*/bin/{name}"), reverse=True):
        return str(candidate)
    raise SystemExit(f"{name} not found")


def main() -> None:  # noqa: PLR0915
    base = pathlib.Path(tempfile.mkdtemp(prefix="sec-rls-", dir="/tmp"))
    data = base / "data"
    port = random.randint(20000, 45000)
    runner = os.environ.get("SECURITY_HARNESS_PG_USER", "lovable")
    as_user = ["setpriv", f"--reuid={runner}", f"--regid={runner}", "--clear-groups"] if os.geteuid() == 0 else []
    if os.geteuid() == 0:
        shutil.chown(base, user=runner, group=runner)
    env = {"PATH": os.environ.get("PATH", ""), "HOME": "/tmp", "LANG": "C"}
    checks: dict[str, bool] = {}
    details: dict[str, object] = {}
    started = False

    def psql(sql: str, check: bool = True) -> tuple[int, str, str]:
        cmd = as_user + [pg_bin("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                         "-h", str(base), "-p", str(port), "-d", "postgres", "-c", sql]
        p = subprocess.run(cmd, text=True, env=env, capture_output=True, timeout=40, check=False)
        if check and p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    def as_role(role: str, user: str | None, sql: str) -> tuple[int, str, str]:
        claim = f"SET request.jwt.claim.sub = '{user}';" if user else "SET request.jwt.claim.sub = '';"
        return psql(f"BEGIN; SET LOCAL ROLE {role}; {claim} {sql} ROLLBACK;", check=False)

    def count(role: str, user: str | None, sql: str) -> int:
        rc, out, err = as_role(role, user, f"SELECT count(*) FROM ({sql}) q;")
        if rc != 0:
            raise RuntimeError(err)
        return int(out.splitlines()[-1])

    def refused(role: str, user: str | None, sql: str) -> bool:
        rc, _, err = as_role(role, user, sql)
        return rc != 0 and "row-level security" in err

    def matrix(stage: str) -> dict[str, object]:
        a, b, staff, master, master2 = ids["a"], ids["b"], ids["staff"], ids["master"], ids["master2"]
        cat = {
            "anon_lessons": count("anon", None, "SELECT 1 FROM public.lessons"),
            "anon_inactive_lesson": count("anon", None, f"SELECT 1 FROM public.lessons WHERE id = '{ids['lesson_off']}'"),
            "anon_lesson_translations": count("anon", None, "SELECT 1 FROM public.lesson_translations"),
            "anon_skills": count("anon", None, "SELECT 1 FROM public.skills"),
            "anon_skill_translations": count("anon", None, "SELECT 1 FROM public.skill_translations"),
            "anon_lesson_skills": count("anon", None, "SELECT 1 FROM public.lesson_skills"),
            "user_inactive_lesson": count("authenticated", a, f"SELECT 1 FROM public.lessons WHERE id = '{ids['lesson_off']}'"),
            "user_lessons": count("authenticated", a, "SELECT 1 FROM public.lessons"),
            "staff_lessons": count("authenticated", staff, "SELECT 1 FROM public.lessons"),
            "staff_lesson_translations": count("authenticated", staff, "SELECT 1 FROM public.lesson_translations"),
            "master_skills": count("authenticated", master, "SELECT 1 FROM public.skills"),
            "master_skill_translations": count("authenticated", master, "SELECT 1 FROM public.skill_translations"),
            "anon_insert_lesson_refused": refused("anon", None, f"INSERT INTO public.lessons (id, slug) VALUES ('{uuid.uuid4()}', 'x');")
            or as_role("anon", None, f"INSERT INTO public.lessons (id, slug) VALUES ('{uuid.uuid4()}', 'x');")[0] != 0,
            "user_insert_lesson_refused": refused("authenticated", a, f"INSERT INTO public.lessons (id, slug) VALUES ('{uuid.uuid4()}', 'x');"),
        }
        sto = {
            "a_own_demo": count("authenticated", a, f"SELECT 1 FROM storage.objects WHERE bucket_id='demos' AND name LIKE '{a}/%'"),
            "a_reads_b_demo": count("authenticated", a, f"SELECT 1 FROM storage.objects WHERE bucket_id='demos' AND name LIKE '{b}/%'"),
            "b_reads_a_demo": count("authenticated", b, f"SELECT 1 FROM storage.objects WHERE bucket_id='demos' AND name LIKE '{a}/%'"),
            "anon_objects": count("anon", None, "SELECT 1 FROM storage.objects"),
            "a_insert_into_b_refused": refused("authenticated", a,
                f"INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('demos', '{b}/x.dem', '{a}', '{a}');"),
            "a_reads_forensic": count("authenticated", a, "SELECT 1 FROM storage.objects WHERE bucket_id='r5-forensic-staging'"),
            "a_insert_forensic_refused": refused("authenticated", a,
                f"INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('r5-forensic-staging', '{FIXTURE}x', '{a}', '{a}');"),
            "owner_master_reads_forensic": count("authenticated", master, "SELECT 1 FROM storage.objects WHERE bucket_id='r5-forensic-staging'"),
            "owner_master_updates_forensic": as_role("authenticated", master,
                f"UPDATE storage.objects SET metadata = '{{}}'::jsonb WHERE bucket_id='r5-forensic-staging' AND name = '{FIXTURE}' RETURNING 1;")[1].count("1") >= 1,
            "other_master_reads_forensic": count("authenticated", master2, "SELECT 1 FROM storage.objects WHERE bucket_id='r5-forensic-staging'"),
            "other_master_updates_forensic": as_role("authenticated", master2,
                f"UPDATE storage.objects SET metadata = '{{}}'::jsonb WHERE bucket_id='r5-forensic-staging' AND name = '{FIXTURE}' RETURNING 1;")[1].count("1") >= 1,
            "other_master_insert_as_other_owner_refused": refused("authenticated", master2,
                f"INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('r5-forensic-staging', '{FIXTURE}', '{master}', '{master}');"),
            "service_reads_forensic": count("service_role", None, "SELECT 1 FROM storage.objects WHERE bucket_id='r5-forensic-staging'"),
            "staff_reads_demos": count("authenticated", staff, "SELECT 1 FROM storage.objects WHERE bucket_id='demos'"),
        }
        result = {"catalog": cat, "storage": sto}
        details[stage] = result
        return result

    ids = {k: str(uuid.uuid4()) for k in ("a", "b", "staff", "master", "master2", "lesson_on", "lesson_off", "skill_on", "skill_off")}
    try:
        subprocess.run(as_user + [pg_bin("initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                       env=env, capture_output=True, check=True, text=True)
        subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-l", str(base / "pg.log"),
                                  "-o", f"-k {base} -p {port} -h ''", "-w", "start"],
                       env=env, capture_output=True, check=True, text=True)
        started = True
        psql(SCHEMA)
        i = ids
        psql(f"""
INSERT INTO public.user_roles VALUES ('{i['staff']}','admin'),('{i['master']}','admin_master'),('{i['master2']}','admin_master'),
  ('{i['a']}','player'),('{i['b']}','player');
INSERT INTO public.lessons (id, slug, lesson_url, active) VALUES ('{i['lesson_on']}','on','https://x/on',true),
  ('{i['lesson_off']}','off','https://x/draft',false);
INSERT INTO public.skills (id, slug, active) VALUES ('{i['skill_on']}','aim',true),('{i['skill_off']}','draft',false);
INSERT INTO public.lesson_translations VALUES ('{i['lesson_on']}','en','On',''),('{i['lesson_off']}','en','Draft','');
INSERT INTO public.skill_translations VALUES ('{i['skill_on']}','en','Aim',''),('{i['skill_off']}','en','Draft','');
INSERT INTO public.lesson_skills VALUES ('{i['lesson_on']}','{i['skill_on']}'),('{i['lesson_on']}','{i['skill_off']}'),
  ('{i['lesson_off']}','{i['skill_on']}');
INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
  ('demos','{i['a']}/a.dem','{i['a']}','{i['a']}'),('demos','{i['b']}/b.dem','{i['b']}','{i['b']}'),
  ('r5-forensic-staging','{FIXTURE}','{i['master']}','{i['master']}');
""")
        before = matrix("before")
        # The vulnerabilities the fix addresses are real in the production-shaped baseline.
        checks["baseline_anon_reads_inactive_lesson"] = before["catalog"]["anon_inactive_lesson"] == 1
        checks["baseline_anon_reads_inactive_translations"] = before["catalog"]["anon_lesson_translations"] == 2
        checks["baseline_other_master_reads_forensic"] = before["storage"]["other_master_reads_forensic"] == 1

        rc, _, err = psql(MIGRATION.read_text(), check=False)
        checks["migration_applies"] = rc == 0
        if rc != 0:
            raise RuntimeError(err)
        checks["migration_reapplies"] = psql(MIGRATION.read_text(), check=False)[0] == 0
        after = matrix("after")
        c, s = after["catalog"], after["storage"]
        checks.update({
            "anon_sees_only_active_lessons": c["anon_lessons"] == 1 and c["anon_inactive_lesson"] == 0,
            "anon_sees_only_active_lesson_translations": c["anon_lesson_translations"] == 1,
            "anon_sees_only_active_skills": c["anon_skills"] == 1,
            "anon_sees_only_active_skill_translations": c["anon_skill_translations"] == 1,
            "anon_sees_only_links_between_active_rows": c["anon_lesson_skills"] == 1,
            "user_sees_only_active_lessons": c["user_lessons"] == 1 and c["user_inactive_lesson"] == 0,
            "staff_still_sees_all_lessons": c["staff_lessons"] == 2 and c["staff_lesson_translations"] == 2,
            "master_still_sees_all_skills": c["master_skills"] == 2 and c["master_skill_translations"] == 2,
            "anon_cannot_write_catalog": bool(c["anon_insert_lesson_refused"]),
            "user_cannot_write_catalog": bool(c["user_insert_lesson_refused"]),
            "a_reads_own_demo": s["a_own_demo"] == 1,
            "a_cannot_read_b_demo": s["a_reads_b_demo"] == 0,
            "b_cannot_read_a_demo": s["b_reads_a_demo"] == 0,
            "anon_reads_no_object": s["anon_objects"] == 0,
            "a_cannot_write_into_b_folder": bool(s["a_insert_into_b_refused"]),
            "user_cannot_read_forensic": s["a_reads_forensic"] == 0,
            "user_cannot_write_forensic": bool(s["a_insert_forensic_refused"]),
            "owner_master_keeps_forensic_read": s["owner_master_reads_forensic"] == 1,
            "owner_master_keeps_forensic_update": bool(s["owner_master_updates_forensic"]),
            "other_master_loses_forensic_read": s["other_master_reads_forensic"] == 0,
            "other_master_loses_forensic_update": not s["other_master_updates_forensic"],
            "other_master_cannot_insert_for_another_owner": bool(s["other_master_insert_as_other_owner_refused"]),
            "service_role_keeps_forensic_read": s["service_reads_forensic"] == 1,
            "staff_demo_support_read_unchanged": s["staff_reads_demos"] == before["storage"]["staff_reads_demos"] == 2,
        })
        policies = psql("SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage');")[1]
        details["policy_count_after"] = int(policies)
    finally:
        if started:
            subprocess.run(as_user + [pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"],
                           env=env, capture_output=True, check=False)
        shutil.rmtree(base, ignore_errors=True)
    failures = sorted(k for k, v in checks.items() if not v)
    print(json.dumps({"database": "disposable-local-postgresql", "checks": checks, "failures": failures,
                      "details": details}, sort_keys=True))


if __name__ == "__main__":
    main()

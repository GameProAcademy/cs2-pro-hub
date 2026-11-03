/**
 * Reproducible catalog load: source file → validated, normalized rows → idempotent SQL.
 *
 *   node --experimental-strip-types scripts/catalog/build-import-sql.ts \
 *     supabase/seed/training-catalog/2026-11-03/training_catalog.json out.sql > report.json
 *
 * Uses the same core as the admin import (`src/lib/catalog/catalogCore.ts`), so the rules
 * (URL shape, sample-course exclusion, language evidence, content groups, topics) are the
 * same for the initial load and for every later import.
 *
 * The SQL is INSERT ... ON CONFLICT (key) DO NOTHING: running it twice changes nothing, it
 * never updates or deletes an existing row, and it records the run in catalog_import_runs.
 * Updates to existing rows go through the admin import, which preserves admin decisions.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  CONTENT_GROUPS,
  normalizeCatalog,
  sourceFromCatalogJson,
} from "../../src/lib/catalog/catalogCore.ts";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: build-import-sql.ts <training_catalog.json> <out.sql>");
  process.exit(2);
}

const catalog = normalizeCatalog(sourceFromCatalogJson(JSON.parse(readFileSync(input, "utf8"))));
const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const arr = (v: string[]) => `ARRAY[${v.map(q).join(",")}]::text[]`;

const count = <T>(xs: T[], f: (x: T) => string) =>
  xs.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});

const report = {
  source: input,
  groups: catalog.groups.length,
  courses: catalog.courses.length,
  lessons: catalog.lessons.length,
  rejected: catalog.rejected.length,
  rejected_by_reason: count(catalog.rejected, (r) => r.reason),
  lessons_by_status: count(catalog.lessons, (l) => l.languageStatus),
  lessons_by_evidence: count(catalog.lessons, (l) => l.languageEvidence),
  confirmed_by_locale: count(
    catalog.lessons.filter((l) => l.languageStatus === "confirmed"),
    (l) => String(l.locale),
  ),
  groups_by_track: count(catalog.groups, (g) => g.track),
  sample_course_urls: [...catalog.courses, ...catalog.lessons].filter((x) =>
    x.url.includes("sample-course"),
  ).length,
};

const sql: string[] = ["BEGIN;"];
for (const g of catalog.groups) {
  const source = g.key in CONTENT_GROUPS ? "content_review" : "import";
  sql.push(
    `INSERT INTO public.catalog_content_groups (key, track, track_source, topics, active) VALUES (${q(g.key)}, ${q(g.track)}, ${q(source)}, ${arr(g.topics)}, ${g.active}) ON CONFLICT (key) DO NOTHING;`,
  );
}
for (const c of catalog.courses) {
  sql.push(
    `INSERT INTO public.catalog_courses (key, group_id, family_slug, slug, locale, title, url, active) SELECT ${q(c.key)}, g.id, ${q(c.family)}, ${q(c.slug)}, ${q(c.locale)}, ${q(c.title)}, ${q(c.url)}, ${c.active} FROM public.catalog_content_groups g WHERE g.key = ${q(c.groupKey)} ON CONFLICT (key) DO NOTHING;`,
  );
}
for (const l of catalog.lessons) {
  sql.push(
    `INSERT INTO public.catalog_lessons (key, group_id, course_id, family_slug, course_slug, locale, language_status, language_evidence, title, url, position, topics, active) SELECT ${q(l.key)}, g.id, ${l.courseKey ? `(SELECT c.id FROM public.catalog_courses c WHERE c.key = ${q(l.courseKey)})` : "NULL"}, ${q(l.family)}, ${q(l.courseSlug)}, ${q(l.locale)}, ${q(l.languageStatus)}, ${q(l.languageEvidence)}, ${q(l.title)}, ${q(l.url)}, ${l.position ?? "NULL"}, ${arr(l.topics)}, ${l.active} FROM public.catalog_content_groups g WHERE g.key = ${q(l.groupKey)} ON CONFLICT (key) DO NOTHING;`,
  );
}
sql.push(
  `INSERT INTO public.catalog_import_runs (actor, source, dry_run, report) VALUES (NULL, ${q(`initial-load:${input.split("/").slice(-2).join("/")}`)}, false, ${q(JSON.stringify(report))}::jsonb);`,
);
sql.push("COMMIT;");

writeFileSync(output, sql.join("\n") + "\n");
console.log(JSON.stringify(report, null, 2));

/**
 * Training catalog administration (admin_master only).
 *
 * Every function resolves the administrator server-side (`resolveAdmin`, fail-closed) and
 * writes with the caller's own RLS session: the `catalog_*` policies only let an
 * `admin_master` write, so even a bug here cannot let a player change the catalog. Every
 * change writes an `admin_audit_logs` entry; a failed audit fails the operation.
 *
 * Imports use the same core as the reproducible initial load (`catalog/catalogCore.ts`):
 * validation, sample-course exclusion, language evidence, groups and topics. An import
 * inserts and updates; it NEVER deletes or deactivates rows absent from the file, and it
 * never overrides an admin decision (language set by an admin, track set by an admin).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdmin, writeAuditLog, type Ctx } from "@/lib/admin.functions";
import {
  CATALOG_LOCALES,
  CATALOG_TRACKS,
  CONTENT_GROUPS,
  normalizeCatalog,
  planLessonImport,
  sourceFromCatalogJson,
  sourceFromCsv,
  urlProblem,
  type CatalogLocale,
  type CatalogTrack,
  type NormalizedCatalog,
  type StoredLesson,
} from "@/lib/catalog/catalogCore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;
const db = (ctx: Ctx) => ctx.supabase as unknown as AnyDb;

const INVALID = "CATALOG_INVALID_INPUT";
const FAILED = "CATALOG_OPERATION_FAILED";
const MAX_IMPORT_BYTES = 5_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") throw new Error(INVALID);
  return input as Record<string, unknown>;
}
function uuid(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Error(INVALID);
  return v;
}
function optText(v: unknown, max: number): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(INVALID);
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || s.length > max) throw new Error(INVALID);
  return s;
}
function optLocale(v: unknown): CatalogLocale | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string" || !(CATALOG_LOCALES as readonly string[]).includes(v))
    throw new Error(INVALID);
  return v as CatalogLocale;
}
function optTopics(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 30) throw new Error(INVALID);
  return [
    ...new Set(
      v.map((t) => {
        if (typeof t !== "string" || !/^[a-z0-9_:]{1,40}$/.test(t)) throw new Error(INVALID);
        return t;
      }),
    ),
  ];
}
function optBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new Error(INVALID);
  return v;
}
function ctxOf(context: unknown): Ctx {
  return context as Ctx;
}

/* ------------------------------------------------------------------ *
 * Reads                                                                *
 * ------------------------------------------------------------------ */

export interface CatalogLessonAdminRow {
  id: string;
  key: string;
  title: string;
  url: string;
  locale: CatalogLocale | null;
  language_status: "confirmed" | "pending";
  language_evidence: string;
  topics: string[];
  active: boolean;
  course_slug: string;
  updated_at: string;
  group: { id: string; key: string; track: CatalogTrack; active: boolean } | null;
}

export const listCatalogLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = asObject(input);
    const page = typeof o["page"] === "number" && o["page"] >= 1 ? Math.floor(o["page"]) : 1;
    const q = typeof o["q"] === "string" ? o["q"].trim().slice(0, 120) : "";
    const locale = typeof o["locale"] === "string" ? o["locale"] : "";
    const status = o["status"] === "confirmed" || o["status"] === "pending" ? o["status"] : "";
    const active = o["active"] === "active" || o["active"] === "inactive" ? o["active"] : "";
    return { page, q, locale, status, active };
  })
  .handler(async ({ context, data }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const pageSize = 50;
    let query = db(ctx)
      .from("catalog_lessons")
      .select(
        "id, key, title, url, locale, language_status, language_evidence, topics, active, course_slug, updated_at, group:catalog_content_groups(id, key, track, active)",
        { count: "exact" },
      )
      .order("course_slug")
      .order("position", { nullsFirst: false })
      .range((data.page - 1) * pageSize, data.page * pageSize - 1);
    if (data.q)
      query = query.or(
        `title.ilike.%${data.q.replace(/[%,()]/g, "")}%,url.ilike.%${data.q.replace(/[%,()]/g, "")}%`,
      );
    if ((CATALOG_LOCALES as readonly string[]).includes(data.locale))
      query = query.eq("locale", data.locale);
    if (data.status) query = query.eq("language_status", data.status);
    if (data.active) query = query.eq("active", data.active === "active");
    const { data: rows, error, count } = await query;
    if (error) throw new Error(FAILED);
    return {
      rows: (rows ?? []) as unknown as CatalogLessonAdminRow[],
      total: count ?? 0,
      pageSize,
    };
  });

export interface CatalogGroupAdminRow {
  id: string;
  key: string;
  track: CatalogTrack;
  track_source: string;
  topics: string[];
  active: boolean;
  lessons: number;
  courses: number;
}

export const listCatalogGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const { data, error } = await db(ctx)
      .from("catalog_content_groups")
      .select(
        "id, key, track, track_source, topics, active, catalog_lessons(count), catalog_courses(count)",
      )
      .order("track")
      .order("key");
    if (error) throw new Error(FAILED);
    return ((data ?? []) as Array<Record<string, unknown>>).map((g) => ({
      id: g["id"] as string,
      key: g["key"] as string,
      track: g["track"] as CatalogTrack,
      track_source: g["track_source"] as string,
      topics: (g["topics"] as string[]) ?? [],
      active: g["active"] as boolean,
      lessons: (g["catalog_lessons"] as Array<{ count: number }>)?.[0]?.count ?? 0,
      courses: (g["catalog_courses"] as Array<{ count: number }>)?.[0]?.count ?? 0,
    })) satisfies CatalogGroupAdminRow[];
  });

/* ------------------------------------------------------------------ *
 * Edits                                                                *
 * ------------------------------------------------------------------ */

export const updateCatalogLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = asObject(input);
    const patch: Record<string, unknown> = {};
    const title = optText(o["title"], 300);
    const url = optText(o["url"], 500);
    const locale = optLocale(o["locale"]);
    const topics = optTopics(o["topics"]);
    const active = optBool(o["active"]);
    const status = o["language_status"];
    if (title !== undefined) patch["title"] = title;
    if (url !== undefined) {
      if (urlProblem(url, "lesson")) throw new Error(INVALID);
      patch["url"] = url;
    }
    if (topics !== undefined) patch["topics"] = topics;
    if (active !== undefined) patch["active"] = active;
    if (locale !== undefined || status !== undefined) {
      if (status !== "confirmed" && status !== "pending") throw new Error(INVALID);
      if (status === "confirmed" && !locale) throw new Error(INVALID);
      // A language decided by an administrator is never overwritten by a later import.
      patch["locale"] = locale ?? null;
      patch["language_status"] = status;
      patch["language_evidence"] = "admin";
    }
    if (!Object.keys(patch).length) throw new Error(INVALID);
    return { id: uuid(o["id"]), patch };
  })
  .handler(async ({ context, data }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const { error } = await db(ctx).from("catalog_lessons").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.code === "23505" ? "CATALOG_DUPLICATE_URL" : FAILED);
    await writeAuditLog(ctx, "CATALOG_LESSON_UPDATED", null, {
      lesson_id: data.id,
      fields: Object.keys(data.patch),
    });
    return { ok: true as const };
  });

export const createCatalogLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = asObject(input);
    const title = optText(o["title"], 300);
    const url = optText(o["url"], 500);
    if (!title || !url || urlProblem(url, "lesson")) throw new Error(INVALID);
    return { courseId: uuid(o["courseId"]), title, url, topics: optTopics(o["topics"]) ?? [] };
  })
  .handler(async ({ context, data }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const course = await db(ctx)
      .from("catalog_courses")
      .select("id, slug, family_slug, locale, group_id")
      .eq("id", data.courseId)
      .maybeSingle();
    if (course.error || !course.data) throw new Error(INVALID);
    const c = course.data as {
      id: string;
      slug: string;
      family_slug: string;
      locale: CatalogLocale;
      group_id: string;
    };
    const m = /\/courses\/([a-z0-9-]+)\/lessons\/([a-z0-9-]+)\/$/.exec(data.url)!;
    // The lesson must live under its course; the course's localized title is the language evidence.
    if (m[1] !== c.slug) throw new Error("CATALOG_LESSON_COURSE_MISMATCH");
    const { data: row, error } = await db(ctx)
      .from("catalog_lessons")
      .insert({
        key: `lesson:${m[1]}/${m[2]}`,
        group_id: c.group_id,
        course_id: c.id,
        family_slug: c.family_slug,
        course_slug: c.slug,
        locale: c.locale,
        language_status: "confirmed",
        language_evidence: "admin",
        title: data.title,
        url: data.url,
        topics: data.topics,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.code === "23505" ? "CATALOG_DUPLICATE_URL" : FAILED);
    await writeAuditLog(ctx, "CATALOG_LESSON_CREATED", null, {
      lesson_id: (row as { id: string }).id,
    });
    return { id: (row as { id: string }).id };
  });

export const deleteCatalogLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ id: uuid(asObject(input)["id"]) }))
  .handler(async ({ context, data }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const { error } = await db(ctx).from("catalog_lessons").delete().eq("id", data.id);
    if (error) throw new Error(FAILED);
    await writeAuditLog(ctx, "CATALOG_LESSON_DELETED", null, { lesson_id: data.id });
    return { ok: true as const };
  });

export const updateCatalogGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = asObject(input);
    const patch: Record<string, unknown> = {};
    if (o["track"] !== undefined) {
      if (
        typeof o["track"] !== "string" ||
        !(CATALOG_TRACKS as readonly string[]).includes(o["track"])
      )
        throw new Error(INVALID);
      patch["track"] = o["track"];
      patch["track_source"] = "admin";
    }
    const topics = optTopics(o["topics"]);
    const active = optBool(o["active"]);
    if (topics !== undefined) patch["topics"] = topics;
    if (active !== undefined) patch["active"] = active;
    if (!Object.keys(patch).length) throw new Error(INVALID);
    return { id: uuid(o["id"]), patch };
  })
  .handler(async ({ context, data }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const { error } = await db(ctx)
      .from("catalog_content_groups")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(FAILED);
    await writeAuditLog(ctx, "CATALOG_GROUP_UPDATED", null, {
      group_id: data.id,
      fields: Object.keys(data.patch),
    });
    return { ok: true as const };
  });

export const updateCatalogCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = asObject(input);
    const patch: Record<string, unknown> = {};
    const title = optText(o["title"], 300);
    const url = optText(o["url"], 500);
    const active = optBool(o["active"]);
    if (title !== undefined) patch["title"] = title;
    if (url !== undefined) {
      if (urlProblem(url, "course")) throw new Error(INVALID);
      patch["url"] = url;
    }
    if (active !== undefined) patch["active"] = active;
    if (!Object.keys(patch).length) throw new Error(INVALID);
    return { id: uuid(o["id"]), patch };
  })
  .handler(async ({ context, data }) => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const { error } = await db(ctx).from("catalog_courses").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.code === "23505" ? "CATALOG_DUPLICATE_URL" : FAILED);
    await writeAuditLog(ctx, "CATALOG_COURSE_UPDATED", null, {
      course_id: data.id,
      fields: Object.keys(data.patch),
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ *
 * Import                                                               *
 * ------------------------------------------------------------------ */

export interface CatalogImportReport {
  dryRun: boolean;
  groups: { incoming: number; inserted: number };
  courses: { incoming: number; inserted: number; updated: number };
  lessons: {
    incoming: number;
    inserted: number;
    updated: number;
    unchanged: number;
    notInFile: number;
  };
  rejected: Array<{ kind: string; ref: string; reason: string }>;
  rejectedTotal: number;
  pendingLanguage: number;
}

function parseImport(input: Record<string, unknown>): NormalizedCatalog {
  const format = input["format"];
  const size = (v: unknown) => (typeof v === "string" ? v.length : 0);
  if (format === "json") {
    if (typeof input["json"] !== "string" || size(input["json"]) > MAX_IMPORT_BYTES)
      throw new Error(INVALID);
    let raw: unknown;
    try {
      raw = JSON.parse(input["json"]);
    } catch {
      throw new Error("CATALOG_IMPORT_UNREADABLE");
    }
    return normalizeCatalog(sourceFromCatalogJson(raw));
  }
  if (format === "csv") {
    const courses = typeof input["coursesCsv"] === "string" ? input["coursesCsv"] : "";
    const lessons = typeof input["lessonsCsv"] === "string" ? input["lessonsCsv"] : "";
    if (!courses && !lessons) throw new Error(INVALID);
    if (size(courses) > MAX_IMPORT_BYTES || size(lessons) > MAX_IMPORT_BYTES)
      throw new Error(INVALID);
    return normalizeCatalog(sourceFromCsv(courses, lessons));
  }
  throw new Error(INVALID);
}

async function selectIn<T>(
  client: AnyDb,
  table: string,
  columns: string,
  field: string,
  values: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 200) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .in(field, values.slice(i, i + 200));
    if (error) throw new Error(FAILED);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export const importCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = asObject(input);
    return {
      input: o,
      dryRun: o["dryRun"] !== false,
      source: optText(o["source"], 200) ?? "admin-upload",
    };
  })
  .handler(async ({ context, data }): Promise<CatalogImportReport> => {
    const ctx = ctxOf(context);
    await resolveAdmin(ctx);
    const catalog = parseImport(data.input);
    const client = db(ctx);

    const groups = await client.from("catalog_content_groups").select("id, key");
    if (groups.error) throw new Error(FAILED);
    const groupId = new Map(
      ((groups.data ?? []) as Array<{ id: string; key: string }>).map((g) => [g.key, g.id]),
    );
    const newGroups = catalog.groups.filter((g) => !groupId.has(g.key));

    const storedCourses = await selectIn<{ id: string; key: string; url: string; title: string }>(
      client,
      "catalog_courses",
      "id, key, url, title",
      "key",
      catalog.courses.map((c) => c.key),
    );
    const courseByKey = new Map(storedCourses.map((c) => [c.key, c]));
    const newCourses = catalog.courses.filter((c) => !courseByKey.has(c.key));
    const changedCourses = catalog.courses.filter((c) => {
      const s = courseByKey.get(c.key);
      return s && (s.url !== c.url || s.title !== c.title);
    });

    const columns = "id, key, url, title, locale, language_status, language_evidence, topics";
    const byKey = await selectIn<StoredLesson>(
      client,
      "catalog_lessons",
      columns,
      "key",
      catalog.lessons.map((l) => l.key),
    );
    const byUrl = await selectIn<StoredLesson>(
      client,
      "catalog_lessons",
      columns,
      "url",
      catalog.lessons.map((l) => l.url),
    );
    const stored = [...new Map([...byKey, ...byUrl].map((s) => [s.id, s])).values()];
    const plan = planLessonImport(stored, catalog.lessons);
    const total = await client.from("catalog_lessons").select("id", { count: "exact", head: true });
    const notInFile = Math.max(0, (total.count ?? 0) - stored.length);

    const report: CatalogImportReport = {
      dryRun: data.dryRun,
      groups: { incoming: catalog.groups.length, inserted: newGroups.length },
      courses: {
        incoming: catalog.courses.length,
        inserted: newCourses.length,
        updated: changedCourses.length,
      },
      lessons: {
        incoming: catalog.lessons.length,
        inserted: plan.insertLessons.length,
        updated: plan.updateLessons.length,
        unchanged: plan.unchangedLessons,
        notInFile,
      },
      rejected: catalog.rejected.slice(0, 50),
      rejectedTotal: catalog.rejected.length,
      pendingLanguage: catalog.lessons.filter((l) => l.languageStatus === "pending").length,
    };

    if (!data.dryRun) {
      for (const g of newGroups) {
        const { data: row, error } = await client
          .from("catalog_content_groups")
          .insert({
            key: g.key,
            track: g.track,
            track_source: g.key in CONTENT_GROUPS ? "content_review" : "import",
            topics: g.topics,
            active: g.active,
          })
          .select("id, key")
          .single();
        if (error || !row) throw new Error(FAILED);
        groupId.set(g.key, (row as { id: string }).id);
      }
      for (const c of newCourses) {
        const { data: row, error } = await client
          .from("catalog_courses")
          .insert({
            key: c.key,
            group_id: groupId.get(c.groupKey),
            family_slug: c.family,
            slug: c.slug,
            locale: c.locale,
            title: c.title,
            url: c.url,
            active: c.active,
          })
          .select("id, key, url, title")
          .single();
        if (error || !row) throw new Error(FAILED);
        courseByKey.set(c.key, row as { id: string; key: string; url: string; title: string });
      }
      for (const c of changedCourses) {
        const id = courseByKey.get(c.key)!.id;
        const { error } = await client
          .from("catalog_courses")
          .update({ url: c.url, title: c.title })
          .eq("id", id);
        if (error) throw new Error(FAILED);
      }
      for (let i = 0; i < plan.insertLessons.length; i += 200) {
        const rows = plan.insertLessons.slice(i, i + 200).map((l) => ({
          key: l.key,
          group_id: groupId.get(l.groupKey),
          course_id: l.courseKey ? (courseByKey.get(l.courseKey)?.id ?? null) : null,
          family_slug: l.family,
          course_slug: l.courseSlug,
          locale: l.locale,
          language_status: l.languageStatus,
          language_evidence: l.languageEvidence,
          title: l.title,
          url: l.url,
          position: l.position,
          topics: l.topics,
          active: l.active,
        }));
        const { error } = await client.from("catalog_lessons").insert(rows);
        if (error) throw new Error(FAILED);
      }
      for (const u of plan.updateLessons) {
        const c = u.changes;
        const patch: Record<string, unknown> = {};
        if (c.title !== undefined) patch["title"] = c.title;
        if (c.url !== undefined) patch["url"] = c.url;
        if (c.locale !== undefined) patch["locale"] = c.locale;
        if (c.languageStatus !== undefined) patch["language_status"] = c.languageStatus;
        if (c.languageEvidence !== undefined) patch["language_evidence"] = c.languageEvidence;
        if (c.topics !== undefined) patch["topics"] = c.topics;
        const { error } = await client.from("catalog_lessons").update(patch).eq("id", u.id);
        if (error) throw new Error(FAILED);
      }
    }

    const { error: runError } = await client.from("catalog_import_runs").insert({
      actor: ctx.userId,
      source: data.source,
      dry_run: data.dryRun,
      report,
    });
    if (runError) throw new Error(FAILED);
    if (!data.dryRun)
      await writeAuditLog(ctx, "CATALOG_IMPORTED", null, {
        source: data.source,
        lessons_inserted: report.lessons.inserted,
        lessons_updated: report.lessons.updated,
        rejected: report.rejectedTotal,
      });
    return report;
  });

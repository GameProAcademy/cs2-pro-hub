/**
 * Catalog reads for the Training plan and the AI Coach (server only).
 *
 * Always the caller's RLS session (players read active rows only), always filtered by
 * locale, language status and topics in the database, always bounded (`limit`), and always
 * gated again by `isRecommendable` in `pickRecommendations`. The catalog is never loaded
 * whole and never sent whole to the model.
 *
 * The `catalog_*` tables are not in the generated Database type (they were added by a
 * manual migration), so rows are read through an untyped client and typed here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CatalogLocale, CatalogTrack, LanguageStatus } from "./catalogCore.ts";
import type { CatalogCandidate } from "./catalogSelect.ts";

interface GroupEmbed {
  key: string;
  track: CatalogTrack;
  active: boolean;
  topics?: string[];
}
interface LessonRow {
  id: string;
  title: string;
  url: string;
  locale: CatalogLocale | null;
  language_status: LanguageStatus;
  active: boolean;
  topics: string[];
  position: number | null;
  group: GroupEmbed | null;
}
interface CourseRow {
  id: string;
  title: string;
  url: string;
  locale: CatalogLocale;
  active: boolean;
  group: GroupEmbed | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;

export const CANDIDATE_LIMIT = 80;

/** Lessons and courses that can serve at least one of `topics`, in `locale`. */
export async function fetchCatalogCandidates(
  db: SupabaseClient<never> | SupabaseClient,
  locale: CatalogLocale,
  topics: string[],
): Promise<CatalogCandidate[]> {
  if (!topics.length) return [];
  const client = db as unknown as AnyDb;
  const [lessons, courses] = await Promise.all([
    client
      .from("catalog_lessons")
      .select(
        "id, title, url, locale, language_status, active, topics, position, group:catalog_content_groups(key, track, active)",
      )
      .eq("locale", locale)
      .eq("language_status", "confirmed")
      .eq("active", true)
      .overlaps("topics", topics)
      .order("position", { ascending: true, nullsFirst: false })
      .limit(CANDIDATE_LIMIT),
    client
      .from("catalog_courses")
      .select(
        "id, title, url, locale, active, group:catalog_content_groups(key, track, active, topics)",
      )
      .eq("locale", locale)
      .eq("active", true)
      .limit(200),
  ]);
  if (lessons.error) throw new Error(`CATALOG_READ_FAILED:${lessons.error.code ?? "unknown"}`);
  if (courses.error) throw new Error(`CATALOG_READ_FAILED:${courses.error.code ?? "unknown"}`);

  const out: CatalogCandidate[] = [];
  for (const l of (lessons.data ?? []) as unknown as LessonRow[]) {
    if (!l.group) continue;
    out.push({
      id: l.id,
      kind: "lesson",
      title: l.title,
      url: l.url,
      locale: l.locale,
      language_status: l.language_status,
      active: l.active,
      group_active: l.group.active,
      group_key: l.group.key,
      track: l.group.track,
      topics: l.topics,
      position: l.position,
    });
  }
  for (const c of (courses.data ?? []) as unknown as CourseRow[]) {
    if (!c.group || !(c.group.topics ?? []).some((t) => topics.includes(t))) continue;
    out.push({
      id: c.id,
      kind: "course",
      title: c.title,
      url: c.url,
      locale: c.locale,
      // A course's language is its own localized title tag: confirmed by construction.
      language_status: "confirmed",
      active: c.active,
      group_active: c.group.active,
      group_key: c.group.key,
      track: c.group.track,
      topics: c.group.topics ?? [],
      position: null,
    });
  }
  return out;
}

/**
 * PM5 / Fase 4.2.10 — moments library reads and writes (module I).
 *
 * Every call runs with the signed-in player's own Supabase session (`requireSupabaseAuth`):
 * RLS limits every row to its owner and re-checks match ownership on insert/update. On top of
 * it the server checks the match is in the caller's own overview (IDOR → NOT_FOUND, identical
 * to a match that does not exist) and that the tick range sits inside the round. Owner ids
 * never come from the client. Lists are keyset-paginated and bounded.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_BOOKMARKS,
  MAX_COLLECTIONS,
  MAX_PAGE_SIZE,
  MOMENT_KINDS,
  MOMENT_SOURCES,
  PAGE_SIZE,
  checkRange,
  decodeCursor,
  encodeCursor,
  noteSchema,
  normalizeTags,
  tagsSchema,
  titleSchema,
  type MomentKind,
  type MomentSource,
} from "@/lib/moments/moments";
import { loadPlayerOverview } from "@/lib/playerData.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>;
const db = (c: { supabase: unknown }) => c.supabase as AnyDb;
const uuid = z.string().uuid();

export interface Moment {
  id: string;
  /** null = the match was deleted: the moment reads as UNAVAILABLE (its text is kept). */
  matchId: string | null;
  map: string | null;
  roundNumber: number | null;
  tickStart: number;
  tickEnd: number;
  eventRef: string | null;
  kind: MomentKind;
  title: string;
  note: string;
  tags: string[];
  source: MomentSource;
  collections: string[];
  availability: "AVAILABLE" | "UNAVAILABLE";
  createdAt: string;
  updatedAt: string;
}

export interface MomentCollection {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  count: number;
  createdAt: string;
}

const COLUMNS =
  "id, match_id, map, round_number, tick_start, tick_end, event_ref, kind, title, note, tags, source, created_at, updated_at";

function toMoment(r: Record<string, unknown>, collections: string[]): Moment {
  const matchId = (r["match_id"] as string | null) ?? null;
  return {
    id: r["id"] as string,
    matchId,
    map: (r["map"] as string | null) ?? null,
    roundNumber: (r["round_number"] as number | null) ?? null,
    tickStart: r["tick_start"] as number,
    tickEnd: r["tick_end"] as number,
    eventRef: (r["event_ref"] as string | null) ?? null,
    kind: r["kind"] as MomentKind,
    title: r["title"] as string,
    note: r["note"] as string,
    tags: (r["tags"] as string[] | null) ?? [],
    source: r["source"] as MomentSource,
    collections,
    availability: matchId ? "AVAILABLE" : "UNAVAILABLE",
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
  };
}

const fail = (label: string, error: { code?: string } | null) => {
  throw new Error(`MOMENTS_${label}_FAILED:${error?.code ?? "unknown"}`);
};

// ------------------------------------------------------------------ list

export const listMomentsInput = z
  .object({
    cursor: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    matchId: uuid.optional(),
    map: z
      .string()
      .regex(/^[a-z0-9_]{1,40}$/)
      .optional(),
    kind: z.enum(MOMENT_KINDS).optional(),
    tag: z.string().max(24).optional(),
    collectionId: uuid.optional(),
    round: z.number().int().min(1).max(99).optional(),
    q: z.string().trim().max(60).optional(),
  })
  .strict();

export interface MomentsPage {
  moments: Moment[];
  nextCursor: string | null;
  collections: MomentCollection[];
  tags: string[];
}

export const listMoments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listMomentsInput.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<MomentsPage> => {
    const d = db(context);
    const limit = data.limit ?? PAGE_SIZE;
    let ids: string[] | null = null;
    if (data.collectionId) {
      const items = await d
        .from("moment_collection_items")
        .select("bookmark_id")
        .eq("collection_id", data.collectionId)
        .limit(MAX_BOOKMARKS);
      if (items.error) fail("LIST", items.error);
      ids = (items.data ?? []).map((i) => i.bookmark_id as string);
      if (!ids.length) return { moments: [], nextCursor: null, ...(await sidebar(d)) };
    }
    let q = d.from("moment_bookmarks").select(COLUMNS);
    if (ids) q = q.in("id", ids);
    if (data.matchId) q = q.eq("match_id", data.matchId);
    if (data.map) q = q.eq("map", data.map);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.round) q = q.eq("round_number", data.round);
    if (data.tag) q = q.contains("tags", [data.tag.toLowerCase()]);
    if (data.q) {
      // PostgREST `or` filter; the text is escaped for its grammar (no commas or parentheses).
      const text = data.q.replace(/[%,()*"\\]/g, " ").trim();
      if (text) q = q.or(`title.ilike."*${text}*",note.ilike."*${text}*"`);
    }
    const cursor = data.cursor ? decodeCursor(data.cursor) : null;
    if (data.cursor && !cursor) throw new Error("MOMENTS_BAD_CURSOR");
    if (cursor)
      q = q.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
      );
    const { data: rows, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (error) fail("LIST", error);
    const page = (rows ?? []).slice(0, limit) as Record<string, unknown>[];
    const membership = new Map<string, string[]>();
    if (page.length) {
      const items = await d
        .from("moment_collection_items")
        .select("bookmark_id, collection_id")
        .in(
          "bookmark_id",
          page.map((r) => r["id"] as string),
        );
      if (items.error) fail("LIST", items.error);
      for (const i of items.data ?? []) {
        const list = membership.get(i.bookmark_id as string) ?? [];
        list.push(i.collection_id as string);
        membership.set(i.bookmark_id as string, list);
      }
    }
    const last = page[page.length - 1];
    return {
      moments: page.map((r) => toMoment(r, membership.get(r["id"] as string) ?? [])),
      nextCursor:
        (rows ?? []).length > limit && last
          ? encodeCursor(last["created_at"] as string, last["id"] as string)
          : null,
      ...(await sidebar(d)),
    };
  });

async function sidebar(d: AnyDb): Promise<{ collections: MomentCollection[]; tags: string[] }> {
  const [cols, items, tagRows] = await Promise.all([
    d
      .from("moment_collections")
      .select("id, name, description, archived, created_at")
      .order("created_at")
      .limit(MAX_COLLECTIONS),
    d
      .from("moment_collection_items")
      .select("collection_id")
      .limit(MAX_BOOKMARKS * 4),
    d.from("moment_bookmarks").select("tags").limit(MAX_BOOKMARKS),
  ]);
  if (cols.error) fail("COLLECTIONS", cols.error);
  if (items.error) fail("COLLECTIONS", items.error);
  if (tagRows.error) fail("TAGS", tagRows.error);
  const counts = new Map<string, number>();
  for (const i of items.data ?? [])
    counts.set(i.collection_id as string, (counts.get(i.collection_id as string) ?? 0) + 1);
  const tags = [...new Set((tagRows.data ?? []).flatMap((r) => (r.tags as string[]) ?? []))].sort();
  return {
    collections: (cols.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: c.description as string,
      archived: c.archived as boolean,
      count: counts.get(c.id as string) ?? 0,
      createdAt: c.created_at as string,
    })),
    tags,
  };
}

// ------------------------------------------------------------------ create / update / delete

export const createMomentInput = z
  .object({
    matchId: uuid,
    round: z.number().int().min(1).max(99),
    tickStart: z.number().int().min(0),
    tickEnd: z.number().int().min(0).optional(),
    eventRef: uuid.optional(),
    kind: z.enum(MOMENT_KINDS),
    title: titleSchema,
    note: noteSchema.optional(),
    tags: tagsSchema.optional(),
    source: z.enum(MOMENT_SOURCES),
  })
  .strict();

export type MomentWriteResult =
  | { status: "OK"; id: string }
  | {
      status:
        | "NOT_FOUND"
        | "ROUND_NOT_FOUND"
        | "ROUND_BOUNDARY_UNKNOWN"
        | "OUT_OF_ROUND"
        | "INVERTED"
        | "TOO_LONG"
        | "BAD_TAGS"
        | "EVENT_NOT_FOUND"
        | "LIMIT";
    };

export const createMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createMomentInput.parse(input))
  .handler(async ({ context, data }): Promise<MomentWriteResult> => {
    const d = db(context);
    const overview = await loadPlayerOverview(context.supabase, context.userId);
    const match = overview.matches.find((m) => m.matchId === data.matchId);
    if (!match) return { status: "NOT_FOUND" };
    const tags = normalizeTags(data.tags ?? []);
    if (!tags.ok) return { status: "BAD_TAGS" };
    const count = await d.from("moment_bookmarks").select("id", { count: "exact", head: true });
    if (count.error) fail("CREATE", count.error);
    if ((count.count ?? 0) >= MAX_BOOKMARKS) return { status: "LIMIT" };
    const round = await d
      .from("match_rounds")
      .select("round_number, start_tick, end_tick")
      .eq("match_id", data.matchId)
      .eq("round_number", data.round)
      .maybeSingle();
    if (round.error) fail("CREATE", round.error);
    const range = checkRange(
      round.data
        ? {
            roundNumber: round.data.round_number as number,
            startTick: (round.data.start_tick as number | null) ?? null,
            endTick: (round.data.end_tick as number | null) ?? null,
          }
        : undefined,
      data.tickStart,
      data.tickEnd,
    );
    if (!range.ok) return { status: range.reason };
    if (data.eventRef) {
      const ev = await d
        .from("round_events")
        .select("id")
        .eq("id", data.eventRef)
        .eq("match_id", data.matchId)
        .maybeSingle();
      if (ev.error) fail("CREATE", ev.error);
      if (!ev.data) return { status: "EVENT_NOT_FOUND" };
    }
    const { data: row, error } = await d
      .from("moment_bookmarks")
      .insert({
        user_id: context.userId,
        match_id: data.matchId,
        map: match.map && /^[a-z0-9_]{1,40}$/.test(match.map) ? match.map : null,
        round_number: data.round,
        tick_start: range.tickStart,
        tick_end: range.tickEnd,
        event_ref: data.eventRef ?? null,
        kind: data.kind,
        title: data.title,
        note: data.note ?? "",
        tags: tags.tags,
        source: data.source,
      })
      .select("id")
      .single();
    if (error) fail("CREATE", error);
    console.info(JSON.stringify({ event: "moment_created", kind: data.kind, source: data.source }));
    return { status: "OK", id: row!.id as string };
  });

export const updateMomentInput = z
  .object({
    id: uuid,
    title: titleSchema.optional(),
    note: noteSchema.optional(),
    tags: tagsSchema.optional(),
    tickStart: z.number().int().min(0).optional(),
    tickEnd: z.number().int().min(0).optional(),
  })
  .strict();

export const updateMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateMomentInput.parse(input))
  .handler(async ({ context, data }): Promise<MomentWriteResult> => {
    const d = db(context);
    const current = await d
      .from("moment_bookmarks")
      .select("id, match_id, round_number, tick_start, tick_end")
      .eq("id", data.id)
      .maybeSingle();
    if (current.error) fail("UPDATE", current.error);
    if (!current.data) return { status: "NOT_FOUND" };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.note !== undefined) patch["note"] = data.note;
    if (data.tags !== undefined) {
      const tags = normalizeTags(data.tags);
      if (!tags.ok) return { status: "BAD_TAGS" };
      patch["tags"] = tags.tags;
    }
    if (data.tickStart !== undefined || data.tickEnd !== undefined) {
      const matchId = current.data.match_id as string | null;
      if (!matchId) return { status: "NOT_FOUND" };
      const round = await d
        .from("match_rounds")
        .select("round_number, start_tick, end_tick")
        .eq("match_id", matchId)
        .eq("round_number", current.data.round_number as number)
        .maybeSingle();
      if (round.error) fail("UPDATE", round.error);
      const range = checkRange(
        round.data
          ? {
              roundNumber: round.data.round_number as number,
              startTick: (round.data.start_tick as number | null) ?? null,
              endTick: (round.data.end_tick as number | null) ?? null,
            }
          : undefined,
        data.tickStart ?? (current.data.tick_start as number),
        data.tickEnd ?? (current.data.tick_end as number),
      );
      if (!range.ok) return { status: range.reason };
      patch["tick_start"] = range.tickStart;
      patch["tick_end"] = range.tickEnd;
    }
    const { error } = await d.from("moment_bookmarks").update(patch).eq("id", data.id);
    if (error) fail("UPDATE", error);
    return { status: "OK", id: data.id };
  });

/** Deletes the caller's bookmark only (RLS); matches and events are never touched. */
export const deleteMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).strict().parse(input))
  .handler(async ({ context, data }): Promise<{ status: "OK" | "NOT_FOUND" }> => {
    const { data: rows, error } = await db(context)
      .from("moment_bookmarks")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) fail("DELETE", error);
    return { status: rows?.length ? "OK" : "NOT_FOUND" };
  });

// ------------------------------------------------------------------ collections

const nameSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().max(500);

export const createCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: nameSchema, description: descriptionSchema.optional() }).strict().parse(input),
  )
  .handler(
    async ({ context, data }): Promise<{ status: "OK"; id: string } | { status: "LIMIT" }> => {
      const d = db(context);
      const count = await d.from("moment_collections").select("id", { count: "exact", head: true });
      if (count.error) fail("COLLECTION", count.error);
      if ((count.count ?? 0) >= MAX_COLLECTIONS) return { status: "LIMIT" };
      const { data: row, error } = await d
        .from("moment_collections")
        .insert({ user_id: context.userId, name: data.name, description: data.description ?? "" })
        .select("id")
        .single();
      if (error) fail("COLLECTION", error);
      return { status: "OK", id: row!.id as string };
    },
  );

export const updateCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        name: nameSchema.optional(),
        description: descriptionSchema.optional(),
        archived: z.boolean().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ status: "OK" | "NOT_FOUND" }> => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.archived !== undefined) patch["archived"] = data.archived;
    const { data: rows, error } = await db(context)
      .from("moment_collections")
      .update(patch)
      .eq("id", data.id)
      .select("id");
    if (error) fail("COLLECTION", error);
    return { status: rows?.length ? "OK" : "NOT_FOUND" };
  });

/** Deletes the collection and its memberships; the bookmarks themselves stay. */
export const deleteCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).strict().parse(input))
  .handler(async ({ context, data }): Promise<{ status: "OK" | "NOT_FOUND" }> => {
    const { data: rows, error } = await db(context)
      .from("moment_collections")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) fail("COLLECTION", error);
    return { status: rows?.length ? "OK" : "NOT_FOUND" };
  });

export const setCollectionMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ collectionId: uuid, bookmarkId: uuid, member: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ context, data }): Promise<{ status: "OK" | "NOT_FOUND" }> => {
    const d = db(context);
    if (!data.member) {
      const { error } = await d
        .from("moment_collection_items")
        .delete()
        .eq("collection_id", data.collectionId)
        .eq("bookmark_id", data.bookmarkId);
      if (error) fail("MEMBERSHIP", error);
      return { status: "OK" };
    }
    const last = await d
      .from("moment_collection_items")
      .select("position")
      .eq("collection_id", data.collectionId)
      .order("position", { ascending: false })
      .limit(1);
    if (last.error) fail("MEMBERSHIP", last.error);
    const position = Math.min(10000, ((last.data?.[0]?.position as number | undefined) ?? -1) + 1);
    const { error } = await d.from("moment_collection_items").upsert(
      {
        collection_id: data.collectionId,
        bookmark_id: data.bookmarkId,
        user_id: context.userId,
        position,
      },
      { onConflict: "collection_id,bookmark_id", ignoreDuplicates: true },
    );
    // RLS rejects a collection or bookmark that is not the caller's: report it as NOT_FOUND.
    if (error) return error.code === "42501" ? { status: "NOT_FOUND" } : fail("MEMBERSHIP", error);
    return { status: "OK" };
  });

/** Sets the order of the caller's collection to the given bookmark order (positions 0..n-1). */
export const reorderCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ collectionId: uuid, bookmarkIds: z.array(uuid).min(1).max(500) })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ status: "OK" | "MISMATCH" }> => {
    const d = db(context);
    const items = await d
      .from("moment_collection_items")
      .select("bookmark_id")
      .eq("collection_id", data.collectionId);
    if (items.error) fail("REORDER", items.error);
    const current = new Set((items.data ?? []).map((i) => i.bookmark_id as string));
    if (current.size !== data.bookmarkIds.length || data.bookmarkIds.some((id) => !current.has(id)))
      return { status: "MISMATCH" };
    for (const [position, id] of data.bookmarkIds.entries()) {
      const { error } = await d
        .from("moment_collection_items")
        .update({ position })
        .eq("collection_id", data.collectionId)
        .eq("bookmark_id", id);
      if (error) fail("REORDER", error);
    }
    return { status: "OK" };
  });

export type { MomentKind, MomentSource };

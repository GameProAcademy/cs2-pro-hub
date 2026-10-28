/**
 * H.3-E quarantine pre-check for new uploads.
 *
 * Canonical matches are content-addressed: `matches.content_fingerprint` is the demo
 * SHA-256, and `persist_canonical_observation` maps an identical demo to its existing match.
 * A match listed in `canonical_match_quarantine` is immutable (no release path).
 *
 * D17 (job b7579762, reference DEM 0caa7c97, 2026-10-21): the content of a quarantined match
 * could never be persisted again, so it was refused before any upload or parse.
 *
 * D32 (migration 20261028090000): content resolution skips quarantined matches, and the
 * quarantined pre-provenance match a7b27f16 no longer reserves its content in the uniqueness
 * indexes, so a verified observation of that content gets its own, eligible Canonical match
 * (the quarantined row stays untouched). Content of any OTHER quarantined match is still
 * reserved by the database until a reviewed migration names it, so it is still refused here.
 *
 * Read-only, service role only (the registry has no client grant). Fails closed: a lookup
 * error refuses the upload rather than spending a parse on unknown state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const QUARANTINED_CONTENT_ERROR = "CANONICAL_MATCH_QUARANTINED";
export const QUARANTINE_LOOKUP_ERROR = "UPLOAD_REGISTRATION_FAILED";

/** Quarantined matches whose content D32 released (named in the uniqueness index predicates). */
export const CONTENT_RELEASED_QUARANTINED_MATCHES: ReadonlySet<string> = new Set([
  "a7b27f16-4c85-428b-a855-0f683bda48a2",
]);

export async function isDemoContentQuarantined(
  db: SupabaseClient<Database>,
  demoSha256: string,
): Promise<boolean> {
  const { data: matches, error } = await db
    .from("matches")
    .select("id")
    .eq("content_fingerprint", demoSha256);
  if (error || !Array.isArray(matches)) throw new Error(QUARANTINE_LOOKUP_ERROR);
  const reserving = matches
    .map((row) => row.id)
    .filter(
      (id): id is string => typeof id === "string" && !CONTENT_RELEASED_QUARANTINED_MATCHES.has(id),
    );
  if (reserving.length === 0) return false;
  const { data: quarantined, error: quarantineError } = await db
    .from("canonical_match_quarantine")
    .select("match_id")
    .in("match_id", reserving);
  if (quarantineError || !Array.isArray(quarantined)) throw new Error(QUARANTINE_LOOKUP_ERROR);
  return quarantined.length > 0;
}

export async function assertDemoContentNotQuarantined(
  db: SupabaseClient<Database>,
  demoSha256: string,
): Promise<void> {
  if (await isDemoContentQuarantined(db, demoSha256)) throw new Error(QUARANTINED_CONTENT_ERROR);
}

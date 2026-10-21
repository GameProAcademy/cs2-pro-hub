/**
 * H.3-E quarantine pre-check for new uploads.
 *
 * Canonical matches are content-addressed: `matches.content_fingerprint` is the demo
 * SHA-256 and is unique, and `persist_canonical_observation` maps an identical demo to
 * its existing match. A match listed in `canonical_match_quarantine` is immutable (no
 * release path), so the same content can never be persisted again. Production evidence:
 * job b7579762 (reference DEM 0caa7c97, 2026-10-21) parsed 4.59M RAW rows three times and
 * was refused at persistence each time with CANONICAL_MATCH_QUARANTINED.
 *
 * Read-only, service role only (the registry has no client grant). Fails closed: a
 * lookup error refuses the upload rather than spending a parse on unknown state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const QUARANTINED_CONTENT_ERROR = "CANONICAL_MATCH_QUARANTINED";
export const QUARANTINE_LOOKUP_ERROR = "UPLOAD_REGISTRATION_FAILED";

export async function isDemoContentQuarantined(
  db: SupabaseClient<Database>,
  demoSha256: string,
): Promise<boolean> {
  const { data: match, error } = await db
    .from("matches")
    .select("id")
    .eq("content_fingerprint", demoSha256)
    .maybeSingle();
  if (error) throw new Error(QUARANTINE_LOOKUP_ERROR);
  if (!match) return false;
  const { data: quarantined, error: quarantineError } = await db
    .from("canonical_match_quarantine")
    .select("match_id")
    .eq("match_id", match.id)
    .maybeSingle();
  if (quarantineError) throw new Error(QUARANTINE_LOOKUP_ERROR);
  return quarantined != null;
}

export async function assertDemoContentNotQuarantined(
  db: SupabaseClient<Database>,
  demoSha256: string,
): Promise<void> {
  if (await isDemoContentQuarantined(db, demoSha256)) throw new Error(QUARANTINED_CONTENT_ERROR);
}

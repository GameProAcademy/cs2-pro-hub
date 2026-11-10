/**
 * Which of the caller's OWN matches are in the Canonical quarantine registry (server only).
 *
 * Client roles can neither read nor write `canonical_match_quarantine` (H.3-E), so the
 * player-facing reads cannot filter it through RLS. This helper answers exactly one
 * question with the service role — "which of THESE match ids are quarantined?" — for ids the
 * caller already obtained from their own RLS-scoped rows. It returns ids only, never registry
 * content, and it fails closed: a failed read is an error, never "nothing is quarantined".
 *
 * Used so that what the player SEES (overview, Player DNA, X-ray, Score, Coach) aggregates
 * exactly the matches the persisted DNA snapshot aggregates.
 */
export async function quarantinedAmong(matchIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(matchIds)];
  if (!ids.length) return new Set();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("canonical_match_quarantine" as never)
    .select("match_id")
    .in("match_id" as never, ids as never);
  if (error) throw new Error(`QUARANTINE_READ_FAILED:${error.code ?? "unknown"}`);
  return new Set(((data ?? []) as { match_id: string }[]).map((q) => q.match_id));
}

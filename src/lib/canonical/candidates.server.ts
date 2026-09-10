/**
 * FASE 2.7 — SOURCE-NEUTRAL CANDIDATE DISCOVERY (server-only).
 *
 * The Match Identity Resolver needs the set of canonical matches an incoming
 * observation could be. That discovery is source-agnostic by construction: it
 * looks at canonical attributes only (roster proven by the Identity Graph plus
 * the competitive time window), never at `matches.player_id` and never at
 * anything FACEIT-specific.
 *
 * The implementation already existed inside the FACEIT module. It is exposed here
 * as the neutral entry point instead of being copied, so DEMO and FACEIT share
 * ONE discovery rule and cannot drift apart.
 */
export { loadCandidates as loadCanonicalCandidates } from "@/lib/faceit/faceit.canonical.server";
export type { MatchIdentityCandidate } from "@/lib/canonical/canonical.resolver";

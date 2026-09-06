/**
 * FASE 2.6 — Gamers Club adapter: ARCHITECTURALLY READY, DELIBERATELY BLOCKED.
 *
 * Gamers Club has no official public API and the public site answers
 * unauthenticated requests with a Cloudflare challenge. We do NOT bypass it: no
 * scraping workaround, no CAPTCHA solving, no proxy rotation.
 *
 * The adapter therefore exists so the canonical engine is complete, and it fails
 * loudly. It NEVER returns fabricated matches.
 */
import { UnavailableCanonicalAdapter } from "../canonical.adapter";
import { SOURCE_CONTRACT_VERSIONS } from "../canonical.versions";

export const gamersClubCanonicalAdapter = new UnavailableCanonicalAdapter(
  "gamers_club",
  SOURCE_CONTRACT_VERSIONS.gamers_club,
  "external_access_blocked",
  "Gamers Club has no official API and blocks unauthenticated access; collection is intentionally not implemented.",
);

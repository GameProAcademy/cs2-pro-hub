/**
 * Global application configuration.
 *
 * DEMO_DATA = true means product-facing score/analysis/coach surfaces still use
 * demonstration data. The real ingestion/parser foundations exist, but these
 * product layers are not yet wired to trusted live analysis data.
 */
export const DEMO_DATA = true;

export const APP_NAME = "CS2 PRO";
export const APP_FULL_NAME = "CS2 PRO AI COACH";
export const APP_TAGLINE = "Análise de performance e treinamento para Counter-Strike 2";

/** Feature flags for capabilities intentionally NOT implemented in this stage. */
export const FEATURES = {
  realAuth: true,
  profilePersistence: true,
  /** The demo ingestion UI (select, validate, queue) exists and is usable. */
  demoIngestionUI: true,
  /** External .dem parser transport is configured; runtime status remains authoritative. */
  realDemoParser: true,
  /** Isolated browser-only experiment. Disabled unless explicitly enabled at build time. */
  clientDemParserPoc: import.meta.env["VITE_CLIENT_DEM_PARSER_POC_ENABLED"] === "true",

  faceitIntegration: true,
  /** No official API and the public site is behind an anti-bot challenge. */
  gamersClubIntegration: false,

  /**
   * Steam identity linking (OpenID 2.0). The UI still refuses to offer the
   * button unless the server environment is actually configured.
   */
  steamIntegration: true,
  aiCoachApi: false,
  payments: false,
} as const;

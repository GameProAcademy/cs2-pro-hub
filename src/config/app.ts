/**
 * Global application configuration.
 *
 * DEMO_DATA = true means EVERY number, chart, diagnosis, training plan and
 * coach message rendered by the app comes from `src/data/*` and is a
 * DEMONSTRATION value. There is no parser, no database, no AI connection yet.
 *
 * When the real pipeline (DEMO -> PARSER -> DATABASE -> METRICS -> SCORE ->
 * DIAGNOSIS -> AI COACH -> TRAINING) is implemented, flip this to false and
 * feed the same component props from the services layer.
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
  /** No real .dem parser worker is connected yet — the UI must say so. */
  realDemoParser: false,

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

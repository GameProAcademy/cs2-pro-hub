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
  profilePersistence: false,
  /** Demo ingestion pipeline exists; real parsing depends on the parser worker. */
  demoParser: true,
  faceitIntegration: false,
  gamersClubIntegration: false,
  steamIntegration: false,
  aiCoachApi: false,
  payments: false,
} as const;

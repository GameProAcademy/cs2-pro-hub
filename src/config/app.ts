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

/**
 * H.1-M controlled Preview-only escape hatch.
 *
 * The workspace cannot configure a public VITE_* Preview variable, so the
 * synthetic Memory Lab may be exposed only on this project's dedicated
 * Lovable Preview hostname. Production/custom domains do not satisfy this
 * exact-host gate. The normal VITE feature flag remains the primary switch.
 * No real DEM/parser/Canonical capability is unlocked by this condition.
 */
const isDedicatedLovablePreview = () =>
  typeof window !== "undefined" &&
  window.location.hostname === "id-preview--91478977-16c3-4839-ae28-6796024bcfc9.lovable.app";

/** Feature flags for capabilities intentionally NOT implemented in this stage. */
export const FEATURES = {
  realAuth: true,
  profilePersistence: true,
  /** The demo ingestion UI (select, validate, queue) exists and is usable. */
  demoIngestionUI: true,
  /** Real DEM admission remains fail-closed until the full forensic/parity/determinism gates are independently proven. */
  realDemoParser: false,
  /** Source-retained test harness; production UI and service execution are sealed off. */
  clientDemParserPoc: false,
  /** Metadata/hash feasibility laboratory only; never unlocks parsing or Canonical. */
  clientDemLargeFileExperimental:
    import.meta.env["VITE_CLIENT_DEM_LARGE_FILE_EXPERIMENTAL"] === "true",
  /** Synthetic-only browser memory diagnostics. Disabled by default and never unlocks parsing. */
  clientDemMemoryLab:
    import.meta.env["VITE_CLIENT_DEM_MEMORY_LAB"] === "true" || isDedicatedLovablePreview(),

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

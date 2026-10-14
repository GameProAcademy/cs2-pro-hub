/**
 * Global application configuration.
 *
 * DEMO_DATA = false: the app renders only the signed-in player's own persisted
 * data (`getPlayerOverview`, RLS-scoped) or an honest state (EMPTY, PROCESSING,
 * IDENTITY_PENDING, BLOCKED, FAILED, ERROR, NOT_AVAILABLE). Pages whose engine
 * has no real data source (Pro Score, Player DNA, X-ray, trends, training plan,
 * AI Coach) say so instead of showing a value.
 *
 * DEMO_DATA = true restores the demonstration pages fed by `src/data/*`, every
 * value of which is fictitious and labelled as such. It must never be true in
 * production.
 */
export const DEMO_DATA = false;

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

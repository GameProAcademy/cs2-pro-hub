/**
 * Central configuration for the demo ingestion / processing pipeline (Phase 2).
 *
 * Every version number, limit and window used by the pipeline lives here.
 * Nothing in the pipeline is allowed to hard-code these values inline.
 */

/** Canonical schema version of the normalised data written to the database. */
export const SCHEMA_VERSION = 1;

/** Version of the derived-metrics / feature-extraction layer. */
export const ANALYSIS_VERSION = "v1";

/**
 * Parser identity. The actual parse runs in an external server-side worker
 * (see docs/PHASE-2-DEMO-PIPELINE.md); the worker reports its own
 * name/version/revision and that report is what gets persisted. These values
 * are the expected/pinned contract.
 */
export const PARSER_NAME = "demoparser2";
/** Pinned parser version expected from the worker. */
export const PARSER_VERSION = "0.31.4";
/** Version of the JSON contract exchanged with the parser worker. */
export const PARSER_CONTRACT_VERSION = 1;

/** Largest accepted demo file. CS2 demos of long matches are big by nature. */
export const MAX_DEMO_SIZE_BYTES = 1_500 * 1024 * 1024; // 1.5 GB

/** Smallest plausible demo file; anything below is empty/truncated. */
export const MIN_DEMO_SIZE_BYTES = 64 * 1024; // 64 KB

/** Accepted demo extension (frontend + backend). */
export const DEMO_EXTENSION = ".dem";

/** Content type used for the demo upload. */
export const DEMO_CONTENT_TYPE = "application/octet-stream";

/** Private bucket that temporarily holds the uploaded demo files. */
export const DEMO_BUCKET = "demos";

/** How long a demo file is kept after a successful, validated processing. */
export const DEMO_RETENTION_HOURS = 24;

/** How long a failed demo is kept for retry/debug purposes. */
export const FAILED_DEMO_RETENTION_HOURS = 72;

/** Trade detection window. Documented, configurable, never inlined. */
export const TRADE_WINDOW_SECONDS = 5;

/**
 * Maximum time between a flash and the kill it may be credited for.
 * Conservative on purpose: CS2 flash blindness rarely stays decisive beyond
 * ~3 seconds, so a longer window would invent assists that did not happen.
 */
export const FLASH_ASSIST_WINDOW_SECONDS = 3;

/** A death in the first N seconds of a round counts as an early death. */
export const EARLY_DEATH_SECONDS = 20;

/** Optional continuous position sampling interval (seconds). 0 disables it. */
export const POSITION_SAMPLE_INTERVAL = 0;

/** Conservative concurrency for demo processing. */
export const MAX_CONCURRENT_DEMO_JOBS = 1;

/** Maximum automatic retries for transient failures. */
export const MAX_JOB_RETRIES = 2;

/** A job stuck in `processing` for longer than this is considered dead. */
export const JOB_STALE_MINUTES = 30;

/** Minimum rounds required before a match is considered a usable sample. */
export const MIN_VALID_ROUNDS = 8;

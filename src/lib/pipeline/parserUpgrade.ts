/**
 * D24 - a demo analysed by an older parser release is reprocessed as a NEW attempt.
 *
 * Production defect (2026-10-23, Mirage job 921b55cf): the job was processed by parser
 * git:a5d8c425... and owns that execution's immutable RAW evidence artifact (one per job).
 * After the R5.8.16 release (git:4716f894...) an identity re-run requeued the SAME job; the new
 * parse can never match the old parser's RAW manifest, so it failed permanently with
 * PARSER_INVALID_RESPONSE "RAW manifest mismatch". The remedy is a fresh attempt (new upload,
 * new job, new RAW artifact) that supersedes the old one, which keeps its history.
 */

const GIT_REVISION = /^git:[0-9a-f]{40}$/;

/**
 * True when the job's recorded parser differs from the parser this server pins.
 * A job without a recorded revision never ran a parse to completion and is not stale
 * by this rule (the database function additionally treats a RAW artifact as a pin).
 */
export function parserUpgradeRequired(
  jobParserRevision: string | null | undefined,
  expectedRevision: string | null | undefined,
): boolean {
  if (!jobParserRevision || !expectedRevision) return false;
  if (!GIT_REVISION.test(expectedRevision)) return false;
  return jobParserRevision !== expectedRevision;
}

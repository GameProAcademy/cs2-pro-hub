/**
 * Source Adapter contract.
 *
 * Every future data source (FACEIT, Gamers Club, Steam, public profiles) must
 * implement this interface and return CANONICAL data. Nothing downstream is
 * allowed to branch on the source: the normalizer, metrics engine, feature
 * extractor, analysis engine and AI Coach all consume the same shapes defined in
 * `src/lib/pipeline/types.ts`.
 *
 * No adapter in this file performs network access. The only implemented source
 * is the demo pipeline (`src/lib/pipeline/*`).
 */
import type { CanonicalMatch } from "@/lib/pipeline/types";

import type { DataCapabilities } from "./capabilities";
import type { DataSource } from "./sources";

/** Where a canonical match came from. Persisted alongside the match row. */
export interface SourceProvenance {
  source: DataSource;
  /** Identifier of the record inside the source, when the source has one. */
  sourceRecordId: string | null;
  /** When the data was collected from the source. */
  fetchedAt: string | null;
  /** Version reported by the source/adapter (API version, parser version...). */
  sourceVersion: string | null;
}

export interface SourceMatchResult {
  provenance: SourceProvenance;
  match: CanonicalMatch;
}

export type SourceAdapterUnavailableReason =
  | "not_implemented"
  | "not_connected"
  | "credentials_missing"
  | "rate_limited"
  | "provider_unavailable";

export interface SourceAdapterAvailability {
  available: boolean;
  reason: SourceAdapterUnavailableReason | null;
}

export interface SourceAdapter {
  readonly source: DataSource;
  readonly capabilities: DataCapabilities;
  /**
   * Honest availability check. An adapter that is not implemented returns
   * `{ available: false, reason: "not_implemented" }` — it never pretends.
   */
  availability(): SourceAdapterAvailability;
  /**
   * Collects matches for an external identity and returns canonical data.
   * Unimplemented adapters MUST throw instead of returning fabricated data.
   */
  collectMatches(input: { externalId: string; since?: string }): Promise<SourceMatchResult[]>;
}

/**
 * Base for every source that is architecturally prepared but intentionally not
 * implemented. It fails loudly, so no code path can silently produce fake data.
 */
export class UnimplementedSourceAdapter implements SourceAdapter {
  constructor(
    readonly source: DataSource,
    readonly capabilities: DataCapabilities,
  ) {}

  availability(): SourceAdapterAvailability {
    return { available: false, reason: "not_implemented" };
  }

  collectMatches(): Promise<SourceMatchResult[]> {
    return Promise.reject(
      new Error(`Source adapter "${this.source}" is not implemented in this phase.`),
    );
  }
}

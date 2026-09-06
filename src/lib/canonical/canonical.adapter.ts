/**
 * FASE 2.6.3 — the SOURCE ADAPTER CONTRACT.
 *
 * Every source (demo, FACEIT, Gamers Club, Steam, public profiles) implements
 * exactly this interface and returns `CanonicalMatchBundle[]`. There is no
 * parallel per-source canonical model, and nothing downstream branches on the
 * source name.
 *
 * An adapter that cannot deliver data FAILS LOUDLY or reports itself
 * unavailable. It never returns fabricated, guessed or zero-filled data.
 */
import type { DataSource } from "@/lib/sources/sources";

import type { CanonicalMatchBundle } from "./canonical.types";
import type { SourceContractVersion } from "./canonical.versions";

export type AdapterUnavailableReason =
  | "not_implemented"
  | "not_connected"
  | "credentials_missing"
  | "identity_only"
  | "external_access_blocked"
  | "rate_limited"
  | "provider_unavailable";

export interface AdapterAvailability {
  available: boolean;
  reason: AdapterUnavailableReason | null;
  /** Plain, honest explanation for logs and the operator UI. */
  detail: string | null;
}

export interface CollectInput {
  /** Identifier of the account INSIDE the source. */
  externalId: string;
  /** Internal player the collection is being run for, when already known. */
  internalPlayerId?: string | null;
  /** Only collect data newer than this ISO timestamp. */
  since?: string | null;
  /** Hard ceiling of records to return. Adapters must respect it. */
  limit?: number | null;
}

export interface CanonicalSourceAdapter {
  readonly source: DataSource;
  readonly contractVersion: SourceContractVersion;
  availability(): AdapterAvailability;
  /**
   * Returns canonical bundles. MUST reject rather than invent data when the
   * source is unavailable, blocked or unimplemented.
   */
  collect(input: CollectInput): Promise<CanonicalMatchBundle[]>;
}

/**
 * Base for a source that is architecturally prepared but deliberately not
 * usable. It exists so no code path can silently produce fake matches.
 */
export class UnavailableCanonicalAdapter implements CanonicalSourceAdapter {
  constructor(
    readonly source: DataSource,
    readonly contractVersion: SourceContractVersion,
    private readonly reason: AdapterUnavailableReason,
    private readonly detail: string,
  ) {}

  availability(): AdapterAvailability {
    return { available: false, reason: this.reason, detail: this.detail };
  }

  collect(): Promise<CanonicalMatchBundle[]> {
    return Promise.reject(
      new Error(`CANONICAL_ADAPTER_UNAVAILABLE source=${this.source} reason=${this.reason}`),
    );
  }
}

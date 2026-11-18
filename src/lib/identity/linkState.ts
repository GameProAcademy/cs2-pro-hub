/**
 * External identity link state — ONE derivation for every screen (profile cards,
 * identities list, upload sources, admin, Coach). Components never keep their own
 * "connected" flag: they pass the stored connection + identity and render this.
 *
 *   NOT_LINKED    no live connection
 *   PENDING       a connection exists but the identity is not (yet) verified
 *   VERIFIED      identity proven by the provider; public profile data not synced
 *                 (no Web API key, private profile, or not fetched yet)
 *   SYNCED        identity proven AND public profile data synced at least once
 *   SYNC_PENDING  identity proven, a synchronisation is queued/running
 *   ERROR         identity proven, the last synchronisation failed
 *   UNAVAILABLE   the integration is not configured in this environment
 *
 * Public data availability never undoes a proven link (a private Steam profile is
 * still VERIFIED).
 */
export type ExternalLinkState =
  "NOT_LINKED" | "PENDING" | "VERIFIED" | "SYNCED" | "SYNC_PENDING" | "ERROR" | "UNAVAILABLE";

export interface LinkStateInput {
  configured: boolean;
  connectionStatus: string | null | undefined;
  identityStatus: string | null | undefined;
  isVerified: boolean | null | undefined;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  syncRunning?: boolean;
}

export function deriveLinkState(input: LinkStateInput): ExternalLinkState {
  const connected = input.connectionStatus === "connected";
  if (!connected) return input.configured ? "NOT_LINKED" : "UNAVAILABLE";
  const proven = input.isVerified === true && input.identityStatus === "verified";
  if (!proven) return "PENDING";
  if (input.syncRunning || input.lastSyncStatus === "retrying") return "SYNC_PENDING";
  if (input.lastSyncStatus === "error" || input.lastSyncStatus === "failed") return "ERROR";
  return input.lastSyncAt ? "SYNCED" : "VERIFIED";
}

/** True for every state in which the account is a proven identity of the player. */
export function isProvenLink(state: ExternalLinkState): boolean {
  return (
    state === "VERIFIED" || state === "SYNCED" || state === "SYNC_PENDING" || state === "ERROR"
  );
}

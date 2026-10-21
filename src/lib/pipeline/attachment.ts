/**
 * FASE 2.7.2A — PLAYER IDENTIFICATION / USER ATTACHMENT DOMAIN.
 *
 * Four concepts that must never collapse into one:
 *
 *  A) MATCH IDENTITY    — "which match is this?" (Match Identity Resolver)
 *  B) PLAYER IDENTITY   — "who played in this match?" (canonical participants)
 *  C) USER ATTACHMENT   — "which of those players is the CS2 PRO user?"
 *  D) IDENTITY METHOD   — "how do we know that?"
 *
 * Everything here is PURE and deterministic: no database, no network, no
 * inference. A nickname is never turned into a Steam ID, a Steam ID is never
 * fabricated, and no fuzzy distance is ever used to pick a player.
 */

/** Attachment STATE — kept separate from the reason. */
export type AttachmentState = "attached" | "unattached" | "conflict";

/**
 * Identity methods. FACEIT and Gamers Club values are reserved for verified
 * provider evidence; this resolver currently emits Steam or manual selection.
 */
export type IdentityMethod =
  | "steam_id_confirmed"
  | "faceit_player_id_confirmed"
  | "gamersclub_player_id_confirmed"
  | "multi_source_confirmed"
  | "manual_user_selection";

/** Who established the attachment. */
export type IdentitySource = "system" | "steam" | "faceit" | "gamersclub" | "user" | "multi_source";

/** Confidence is a separate axis from the method and never hides a conflict. */
export type IdentityConfidence = "high" | "medium" | "low";

export type IdentityConfirmationStatus =
  "pending_confirmation" | "user_confirmed" | "user_rejected" | "not_required" | "manual_selected";

/** WHY there is no attachment (or why it conflicts). Never a state. */
export type AttachmentReason =
  | "no_player_profile"
  | "no_steam_id_on_profile"
  | "steam_id_not_in_demo"
  | "self_declared_nickname_not_found"
  | "ambiguous_nickname"
  | "user_not_selected"
  | "identity_conflict";

/** A player as observed inside the demo/canonical match. */
export interface DemoParticipant {
  /** Real identifier produced by the parser/canonical domain — never fabricated. */
  participantKey: string;
  steamId: string | null;
  nickname: string | null;
  team: string | null;
}

/** What the user explicitly declared for this demo, if anything. */
export type PlayerDeclaration =
  { kind: "participant"; participantKey: string } | { kind: "nickname"; nickname: string };

export interface AttachmentOutcome {
  state: AttachmentState;
  /** Canonical participant the user is attached to, when attached. */
  participantKey: string | null;
  /** Steam ID OF THE DEMO PLAYER used as the metrics target, when available. */
  steamId: string | null;
  observedNickname: string | null;
  method: IdentityMethod | null;
  source: IdentitySource | null;
  confidence: IdentityConfidence | null;
  reason: AttachmentReason | null;
}

/** Numeric mirror kept for the existing `attachment_confidence` column. */
export function confidenceScore(confidence: IdentityConfidence | null): number | null {
  switch (confidence) {
    case "high":
      return 1;
    case "medium":
      return 0.8;
    case "low":
      return 0.3;
    default:
      return null;
  }
}

/**
 * Conservative nickname normalisation for LOOKUP only.
 *
 * Normalises Unicode form, collapses whitespace and folds case. It does NOT
 * strip characters that distinguish players: "THIAGO1" never equals "THIAGO".
 */
export function normalizeNickname(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export type NicknameMatchStatus = "unique" | "ambiguous" | "none";

export interface NicknameMatchResult {
  status: NicknameMatchStatus;
  matches: DemoParticipant[];
}

/**
 * Exact (normalised) nickname lookup among the demo players.
 * Two players sharing the nickname produce `ambiguous` — never a silent pick.
 */
export function matchDeclaredNicknameToDemoPlayers(
  nickname: string,
  participants: readonly DemoParticipant[],
): NicknameMatchResult {
  const wanted = normalizeNickname(nickname);
  if (!wanted) return { status: "none", matches: [] };
  const matches = participants.filter(
    (participant) => participant.nickname && normalizeNickname(participant.nickname) === wanted,
  );
  if (matches.length === 1) return { status: "unique", matches };
  if (matches.length > 1) return { status: "ambiguous", matches };
  return { status: "none", matches: [] };
}

function unattached(reason: AttachmentReason): AttachmentOutcome {
  return {
    state: "unattached",
    participantKey: null,
    steamId: null,
    observedNickname: null,
    method: null,
    source: null,
    confidence: null,
    reason,
  };
}

function attached(
  participant: DemoParticipant,
  method: IdentityMethod,
  source: IdentitySource,
  confidence: IdentityConfidence,
): AttachmentOutcome {
  return {
    state: "attached",
    participantKey: participant.participantKey,
    steamId: participant.steamId,
    observedNickname: participant.nickname,
    method,
    source,
    confidence,
    reason: null,
  };
}

export interface ResolveAttachmentInput {
  participants: readonly DemoParticipant[];
  /** Whether the signed-in user has a player profile at all. */
  hasProfile: boolean;
  /** Steam ID PROVEN on the profile (never a guess). */
  profileSteamId: string | null;
  /** Explicit user declaration for this demo, when present. */
  declaration?: PlayerDeclaration | null;
  /** User explicitly rejected the otherwise strong automatic match. */
  automaticMatchRejected?: boolean;
}

/**
 * Decides the user attachment for ONE demo.
 *
 * Precedence: a confirmed Steam ID wins over any declaration. A declaration
 * that contradicts a confirmed Steam ID is a CONFLICT — never silently
 * overridden and never silently accepted. If the linked Steam ID is absent
 * from the demo, explicit manual selection remains available without claiming
 * that the selected participant owns that Steam account.
 */
export function resolvePlayerAttachment(input: ResolveAttachmentInput): AttachmentOutcome {
  const {
    participants,
    hasProfile,
    profileSteamId,
    declaration = null,
    automaticMatchRejected = false,
  } = input;
  if (!hasProfile) return unattached("no_player_profile");

  const steamMatches = profileSteamId
    ? participants.filter((participant) => participant.steamId === profileSteamId)
    : [];
  // One Steam ID on two demo participants is contradictory evidence about the
  // demo itself: picking "the first" would attach metrics arbitrarily. It is a
  // CONFLICT, never resolved automatically and never overridden by a declaration.
  if (steamMatches.length > 1) return { ...unattached("identity_conflict"), state: "conflict" };
  const steamParticipant = steamMatches[0] ?? null;

  if (profileSteamId && steamParticipant) {
    if (automaticMatchRejected) {
      return declaration
        ? resolveDeclaration(declaration, participants)
        : unattached("user_not_selected");
    }
    // Steam ID has precedence. A declaration pointing elsewhere is contradictory
    // evidence and must be surfaced, never resolved automatically.
    if (declaration) {
      const declared = resolveDeclaration(declaration, participants);
      if (
        declared.state === "attached" &&
        declared.participantKey !== steamParticipant.participantKey
      ) {
        return { ...unattached("identity_conflict"), state: "conflict" };
      }
    }
    // The observed nickname is auxiliary evidence and never lowers confidence.
    return attached(steamParticipant, "steam_id_confirmed", "steam", "high");
  }

  // A linked Steam account that is absent from this demo cannot prove any
  // participant. It must not block an explicit manual selection: the method
  // stays manual and the absent Steam ID is never attached to the chosen row.
  if (profileSteamId && declaration) return resolveDeclaration(declaration, participants);
  if (profileSteamId) return unattached("steam_id_not_in_demo");

  if (declaration) return resolveDeclaration(declaration, participants);

  return unattached("no_steam_id_on_profile");
}

function resolveDeclaration(
  declaration: PlayerDeclaration,
  participants: readonly DemoParticipant[],
): AttachmentOutcome {
  if (declaration.kind === "participant") {
    const participant = participants.find(
      (candidate) => candidate.participantKey === declaration.participantKey,
    );
    if (!participant) return unattached("user_not_selected");
    return attached(participant, "manual_user_selection", "user", "medium");
  }

  const found = matchDeclaredNicknameToDemoPlayers(declaration.nickname, participants);
  if (found.status === "unique" && found.matches[0]) {
    return attached(found.matches[0], "manual_user_selection", "user", "medium");
  }
  if (found.status === "ambiguous") return unattached("ambiguous_nickname");
  return unattached("self_declared_nickname_not_found");
}

/**
 * Values accepted by `demo_jobs.attachment_method` (check constraint
 * `demo_jobs_attachment_method_check`). The resolver's {@link IdentityMethod} is the
 * domain vocabulary; this is the STORED vocabulary, kept by every row already in
 * production (`self_declared_player`). Production defect D11 (2026-10-21): the
 * resolver's `manual_user_selection` was written unchanged, the constraint refused
 * it, and every manual selection failed with a generic error.
 */
export const STORED_ATTACHMENT_METHODS = [
  "steam_id_profile",
  "steam_id_confirmed",
  "self_declared_player",
  "self_declared_nickname",
] as const;
export type StoredAttachmentMethod = (typeof STORED_ATTACHMENT_METHODS)[number];

/**
 * Maps the resolver's method to the stored one. A manual selection is stored by
 * what the user declared: a participant (`self_declared_player`) or a nickname
 * that resolved to exactly one participant (`self_declared_nickname`). A method the
 * database cannot store fails closed instead of being written as something else.
 */
export function storedAttachmentMethod(
  method: IdentityMethod | null,
  declarationKind: PlayerDeclaration["kind"] | null,
): StoredAttachmentMethod | null {
  if (method === null) return null;
  if (method === "steam_id_confirmed") return "steam_id_confirmed";
  if (method === "manual_user_selection" && declarationKind === "participant")
    return "self_declared_player";
  if (method === "manual_user_selection" && declarationKind === "nickname")
    return "self_declared_nickname";
  throw new Error("IDENTITY_METHOD_NOT_STORABLE");
}

/** Error tokens raised by the identity RPCs that are safe to show and to log. */
const IDENTITY_RPC_CODES = [
  "IDENTITY_DECISION_STALE",
  "IDENTITY_DECISION_CONFLICT",
  "PARTICIPANT_NOT_IN_MATCH",
  "CANONICAL_MATCH_MISMATCH",
  "MATCH_NOT_ANALYSED",
  "PLAYER_PROFILE_NOT_FOUND",
  "JOB_NOT_FOUND",
] as const;
export type IdentityRpcErrorCode =
  (typeof IDENTITY_RPC_CODES)[number] | "IDENTITY_DECISION_INVALID" | "JOB_REQUEUE_FAILED";

/**
 * Safe classification of an identity RPC failure. Only a known token, or the name of a
 * violated constraint, leaves this function: never the database message itself, which
 * can carry the full row (Steam IDs, nicknames, storage paths).
 */
export function classifyIdentityRpcError(error: {
  code?: string | null;
  message?: string | null;
}): {
  code: IdentityRpcErrorCode;
  constraint: string | null;
} {
  const message = error.message ?? "";
  const known = IDENTITY_RPC_CODES.find((token) => message.includes(token));
  if (known) return { code: known, constraint: null };
  if (error.code === "23514" || error.code === "23502" || error.code === "23503") {
    const constraint = /constraint "([a-z0-9_]{1,63})"/.exec(message)?.[1] ?? null;
    return { code: "IDENTITY_DECISION_INVALID", constraint };
  }
  return { code: "JOB_REQUEUE_FAILED", constraint: null };
}

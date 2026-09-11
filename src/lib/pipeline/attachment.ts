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
 * Identity methods. Only the three below have real data today; FACEIT and
 * Gamers Club are deliberately absent until their integrations exist.
 */
export type IdentityMethod =
  "steam_id_confirmed" | "self_declared_player" | "self_declared_nickname";

/** Who established the attachment. */
export type IdentitySource = "system" | "user";

/** Confidence is a separate axis from the method and never hides a conflict. */
export type IdentityConfidence = "high" | "user_confirmed" | "low" | "unresolved";

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
    case "user_confirmed":
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
}

/**
 * Decides the user attachment for ONE demo.
 *
 * Precedence: a confirmed Steam ID wins over any declaration. A declaration
 * that contradicts a confirmed Steam ID is a CONFLICT — never silently
 * overridden and never silently accepted.
 */
export function resolvePlayerAttachment(input: ResolveAttachmentInput): AttachmentOutcome {
  const { participants, hasProfile, profileSteamId, declaration = null } = input;
  if (!hasProfile) return unattached("no_player_profile");

  const steamParticipant = profileSteamId
    ? (participants.find((participant) => participant.steamId === profileSteamId) ?? null)
    : null;

  if (profileSteamId && steamParticipant) {
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
    return attached(steamParticipant, "steam_id_confirmed", "system", "high");
  }

  if (declaration) return resolveDeclaration(declaration, participants);

  if (profileSteamId) return unattached("steam_id_not_in_demo");
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
    return attached(participant, "self_declared_player", "user", "user_confirmed");
  }

  const found = matchDeclaredNicknameToDemoPlayers(declaration.nickname, participants);
  if (found.status === "unique" && found.matches[0]) {
    return attached(found.matches[0], "self_declared_nickname", "user", "user_confirmed");
  }
  if (found.status === "ambiguous") return unattached("ambiguous_nickname");
  return unattached("self_declared_nickname_not_found");
}

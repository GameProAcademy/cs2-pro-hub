/**
 * FASE 2.7.2A — "WHO ARE YOU IN THIS DEMO?" (client-facing server functions).
 *
 * A canonical match is analysed and stored regardless of the user's identity.
 * These functions let the OWNER of an upload declare, explicitly, which demo
 * player is them, so metrics/features/projection can be produced over the SAME
 * canonical match. Nothing here writes `player_profiles.steam_id`, invents a
 * Steam ID, or infers a player from a similar nickname.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  confidenceScore,
  resolvePlayerAttachment,
  type AttachmentOutcome,
  type DemoParticipant,
  type PlayerDeclaration,
} from "@/lib/pipeline/attachment";

export interface DemoParticipantView {
  participantKey: string;
  nickname: string | null;
  team: string | null;
}

export interface DemoIdentityView {
  jobId: string;
  matchId: string | null;
  attachmentState: string;
  attachmentReason: string | null;
  attachmentMethod: string | null;
  attachmentConfidence: string | null;
  declaredNickname: string | null;
  declaredParticipantKey: string | null;
  observedNickname: string | null;
  participants: DemoParticipantView[];
}

const jobSchema = z.object({ jobId: z.string().uuid() });

const declareSchema = z
  .object({
    jobId: z.string().uuid(),
    participantKey: z.string().min(1).max(64).optional(),
    nickname: z.string().min(1).max(64).optional(),
  })
  // Exactly one declaration shape at a time.
  .refine(
    (value) => Boolean(value.participantKey) !== Boolean(value.nickname),
    "DECLARATION_SHAPE",
  );

/** Loads the job (RLS-scoped to its owner) plus the demo players detected. */
export const getDemoIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => jobSchema.parse(input))
  .handler(async ({ data, context }): Promise<DemoIdentityView | null> => {
    const { supabase } = context;
    const { data: job } = await supabase
      .from("demo_jobs")
      .select(
        "id, match_id, attachment_state, attachment_reason, attachment_method, attachment_confidence_label, declared_nickname, declared_participant_key, observed_nickname",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) return null;

    const participants = job.match_id ? await readParticipants(supabase, job.match_id) : [];

    return {
      jobId: job.id,
      matchId: job.match_id,
      attachmentState: job.attachment_state,
      attachmentReason: job.attachment_reason,
      attachmentMethod: job.attachment_method,
      attachmentConfidence: job.attachment_confidence_label,
      declaredNickname: job.declared_nickname,
      declaredParticipantKey: job.declared_participant_key,
      observedNickname: job.observed_nickname,
      participants: participants.map((participant) => ({
        participantKey: participant.participantKey,
        nickname: participant.nickname,
        team: participant.team,
      })),
    };
  });

export interface DeclareResult {
  state: AttachmentOutcome["state"];
  method: AttachmentOutcome["method"];
  confidence: AttachmentOutcome["confidence"];
  reason: AttachmentOutcome["reason"];
  /** Candidates to disambiguate when the declared nickname is not unique. */
  candidates: DemoParticipantView[];
  /** True when the demo is being reprocessed to produce the player projection. */
  reprocessing: boolean;
}

/**
 * Records the user's explicit declaration for one of THEIR OWN demos.
 *
 * On an unambiguous result the job is re-queued: the canonical match is
 * idempotent (same fingerprint -> same canonical match), so reprocessing adds
 * metrics/features/projection without duplicating canonical rows.
 */
export const declareDemoPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => declareSchema.parse(input))
  .handler(async ({ data, context }): Promise<DeclareResult> => {
    const { supabase, userId } = context;

    // Ownership check runs as the USER (RLS), never as the admin client.
    const { data: job } = await supabase
      .from("demo_jobs")
      .select("id, match_id, status, player_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (!job.match_id) throw new Error("MATCH_NOT_ANALYSED");

    const participants = await readParticipants(supabase, job.match_id);
    const { data: profile } = await supabase
      .from("player_profiles")
      .select("id, steam_id")
      .eq("user_id", userId)
      .maybeSingle();

    const declaration: PlayerDeclaration = data.participantKey
      ? { kind: "participant", participantKey: data.participantKey }
      : { kind: "nickname", nickname: data.nickname! };

    const outcome = resolvePlayerAttachment({
      participants,
      hasProfile: Boolean(profile),
      profileSteamId: profile?.steam_id ?? null,
      declaration,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const attach = outcome.state === "attached";
    await supabaseAdmin
      .from("demo_jobs")
      .update({
        declared_participant_key: data.participantKey ?? null,
        declared_nickname: data.nickname ?? null,
        attachment_declared_at: new Date().toISOString(),
        attachment_declared_by: userId,
        attachment_state: outcome.state,
        attachment_method: outcome.method,
        attachment_source: outcome.source,
        attachment_confidence: confidenceScore(outcome.confidence),
        attachment_confidence_label: outcome.confidence,
        attachment_participant_key: outcome.participantKey,
        observed_nickname: outcome.observedNickname,
        attachment_reason: outcome.reason,
        // Re-queue only when the declaration actually resolves a player.
        ...(attach ? { status: "pending" as const, stage: "queued", error_code: null } : {}),
      })
      .eq("id", job.id)
      .eq("user_id", userId);

    const ambiguous = outcome.reason === "ambiguous_nickname" && data.nickname;
    return {
      state: outcome.state,
      method: outcome.method,
      confidence: outcome.confidence,
      reason: outcome.reason,
      candidates: ambiguous
        ? participants
            .filter(
              (participant) =>
                participant.nickname &&
                participant.nickname.trim().toLocaleLowerCase() ===
                  data.nickname!.trim().toLocaleLowerCase(),
            )
            .map((participant) => ({
              participantKey: participant.participantKey,
              nickname: participant.nickname,
              team: participant.team,
            }))
        : [],
      reprocessing: attach,
    };
  });

/** Minimal read surface, kept loose so the generated types stay shallow. */
interface ParticipantReader {
  from: (table: "match_participants") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ data: Array<Record<string, string | null>> | null }>;
    };
  };
}

/** Demo players of a canonical match, read under the owner's RLS. */
async function readParticipants(supabase: unknown, matchId: string): Promise<DemoParticipant[]> {
  const { data } = await (supabase as ParticipantReader)
    .from("match_participants")
    .select("participant_key, steam_id64, nickname_snapshot, team")
    .eq("match_id", matchId);
  return (data ?? []).map((row) => ({
    participantKey: row["participant_key"] ?? "",
    steamId: row["steam_id64"] ?? null,
    nickname: row["nickname_snapshot"] ?? null,
    team: row["team"] ?? null,
  }));
}

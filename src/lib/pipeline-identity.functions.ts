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
  attachmentSource: string | null;
  attachmentParticipantKey: string | null;
  declaredNickname: string | null;
  declaredParticipantKey: string | null;
  observedNickname: string | null;
  latestDecisionStatus: string | null;
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

const decisionSchema = z.object({
  jobId: z.string().uuid(),
  action: z.enum(["confirm", "reject"]),
});

/** Loads the job (RLS-scoped to its owner) plus the demo players detected. */
export const getDemoIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => jobSchema.parse(input))
  .handler(async ({ data, context }): Promise<DemoIdentityView | null> => {
    const { supabase } = context;
    const { data: job } = await supabase
      .from("demo_jobs")
      .select(
        "id, match_id, attachment_state, attachment_reason, attachment_method, attachment_source, attachment_confidence_label, attachment_participant_key, declared_nickname, declared_participant_key, observed_nickname",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) return null;

    const participants = job.match_id ? await readParticipants(supabase, job.match_id) : [];
    const { data: latestDecision } = await supabase
      .from("demo_identity_decisions")
      .select("status")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      jobId: job.id,
      matchId: job.match_id,
      attachmentState: job.attachment_state,
      attachmentReason: job.attachment_reason,
      attachmentMethod: job.attachment_method,
      attachmentConfidence: job.attachment_confidence_label,
      attachmentSource: job.attachment_source,
      attachmentParticipantKey: job.attachment_participant_key,
      declaredNickname: job.declared_nickname,
      declaredParticipantKey: job.declared_participant_key,
      observedNickname: job.observed_nickname,
      latestDecisionStatus: latestDecision?.status ?? null,
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
    const { data: requeued, error: requeueError } = await supabaseAdmin.rpc(
      "requeue_demo_job_after_attachment",
      {
        _job_id: job.id,
        _user_id: userId,
        _attachment: {
          event_key: `manual:${outcome.participantKey ?? data.nickname ?? "unresolved"}`,
          declared_participant_key: data.participantKey ?? null,
          declared_nickname: data.nickname ?? null,
          state: outcome.state,
          method: outcome.method,
          source: outcome.source,
          confidence_score: confidenceScore(outcome.confidence),
          confidence: outcome.confidence,
          participant_key: outcome.participantKey,
          observed_nickname: outcome.observedNickname,
          reason: outcome.reason,
        },
      },
    );
    if (requeueError || !requeued) throw new Error("JOB_REQUEUE_FAILED");

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

/** Records confirmation or rejection of a strong automatic Steam match. */
export const decideAutomaticDemoPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job } = await supabase
      .from("demo_jobs")
      .select(
        "id, attachment_state, attachment_method, attachment_source, attachment_confidence, attachment_confidence_label, attachment_participant_key, observed_nickname",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (
      job.attachment_state !== "attached" ||
      job.attachment_method !== "steam_id_confirmed" ||
      job.attachment_source !== "system" ||
      !job.attachment_participant_key
    ) {
      throw new Error("AUTOMATIC_MATCH_NOT_AVAILABLE");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("record_demo_identity_event", {
      _job_id: job.id,
      _user_id: userId,
      _event_key: `${data.action}:steam:${job.attachment_participant_key}`,
      _decision: {
        status: data.action === "confirm" ? "confirmed" : "rejected_auto_match",
        participant_key: job.attachment_participant_key,
        nickname: job.observed_nickname,
        method: job.attachment_method,
        source: "user",
        confidence_label: job.attachment_confidence_label,
        confidence_score: job.attachment_confidence,
        reason: data.action === "reject" ? "user_rejected_auto_match" : null,
        evidence: { automatic_source: "steam" },
      },
    } as never);
    if (error) throw new Error("IDENTITY_DECISION_FAILED");
    return { action: data.action, recorded: true as const };
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

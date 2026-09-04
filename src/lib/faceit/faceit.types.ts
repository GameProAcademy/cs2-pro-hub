/**
 * FASE 2.2.1 — runtime-validated FACEIT Data API shapes.
 *
 * External JSON is NEVER trusted: every payload is parsed with a permissive but
 * explicit schema. Unknown fields are dropped, missing fields stay `null` — a
 * missing value is never coerced into zero.
 */
import { z } from "zod";

import { FaceitError } from "./faceit.errors";

const nullableString = z.string().min(1).nullish().transform((v) => v ?? null);
const nullableNumber = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

export const faceitGameSchema = z.object({
  game_player_id: nullableString,
  game_player_name: nullableString,
  skill_level: nullableNumber,
  faceit_elo: nullableNumber,
  region: nullableString,
});

export const faceitPlayerSchema = z.object({
  player_id: z.string().min(1),
  nickname: nullableString,
  avatar: nullableString,
  country: nullableString,
  faceit_url: nullableString,
  steam_id_64: nullableString,
  membership_type: nullableString,
  memberships: z.array(z.string()).nullish().transform((v) => v ?? null),
  activated_at: nullableString,
  verified: z.boolean().nullish().transform((v) => v ?? null),
  games: z.record(z.string(), faceitGameSchema.partial().passthrough()).nullish(),
});

export type FaceitPlayer = z.infer<typeof faceitPlayerSchema>;

export const faceitHistoryItemSchema = z.object({
  match_id: z.string().min(1),
  game_id: nullableString,
  region: nullableString,
  competition_id: nullableString,
  competition_name: nullableString,
  competition_type: nullableString,
  organizer_id: nullableString,
  status: nullableString,
  started_at: nullableNumber,
  finished_at: nullableNumber,
  faceit_url: nullableString,
  results: z
    .object({ winner: nullableString, score: z.record(z.string(), nullableNumber).nullish() })
    .nullish(),
  teams: z
    .record(
      z.string(),
      z
        .object({
          team_id: nullableString,
          nickname: nullableString,
          players: z
            .array(z.object({ player_id: nullableString, nickname: nullableString }).passthrough())
            .nullish(),
        })
        .passthrough(),
    )
    .nullish(),
});

export type FaceitHistoryItem = z.infer<typeof faceitHistoryItemSchema>;

export const faceitHistoryPageSchema = z.object({
  items: z.array(faceitHistoryItemSchema).nullish().transform((v) => v ?? []),
  start: nullableNumber,
  end: nullableNumber,
});

export const faceitMatchSchema = z.object({
  match_id: z.string().min(1),
  game: nullableString,
  region: nullableString,
  competition_name: nullableString,
  competition_type: nullableString,
  organizer_id: nullableString,
  status: nullableString,
  best_of: nullableNumber,
  started_at: nullableNumber,
  finished_at: nullableNumber,
  faceit_url: nullableString,
  /**
   * Reference ONLY. The CS2 PRO never downloads a FACEIT demo and never calls
   * the Download API; we keep availability as external metadata, not the URL.
   */
  demo_url: z.array(z.string()).nullish().transform((v) => v ?? null),
  detailed_results: z
    .array(
      z
        .object({
          asc_score: z.boolean().nullish(),
          winner: nullableString,
          factions: z.record(z.string(), z.object({ score: nullableNumber }).passthrough()).nullish(),
        })
        .passthrough(),
    )
    .nullish()
    .transform((v) => v ?? null),
  voting: z
    .object({ map: z.object({ pick: z.array(z.string()).nullish() }).nullish() })
    .nullish(),
  results: z
    .object({ winner: nullableString, score: z.record(z.string(), nullableNumber).nullish() })
    .nullish(),
  teams: z
    .record(
      z.string(),
      z
        .object({
          team_id: nullableString,
          name: nullableString,
          nickname: nullableString,
          roster: z
            .array(
              z
                .object({
                  player_id: nullableString,
                  nickname: nullableString,
                  game_skill_level: nullableNumber,
                })
                .passthrough(),
            )
            .nullish(),
        })
        .passthrough(),
    )
    .nullish(),
});

export type FaceitMatch = z.infer<typeof faceitMatchSchema>;

const statsRecord = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const faceitMatchStatsSchema = z.object({
  rounds: z
    .array(
      z.object({
        match_id: nullableString,
        best_of: nullableNumber,
        round_stats: statsRecord.nullish(),
        teams: z
          .array(
            z.object({
              team_id: nullableString,
              team_stats: statsRecord.nullish(),
              players: z
                .array(
                  z.object({
                    player_id: nullableString,
                    nickname: nullableString,
                    player_stats: statsRecord.nullish(),
                  }),
                )
                .nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
});

export type FaceitMatchStats = z.infer<typeof faceitMatchStatsSchema>;

export const faceitLifetimeStatsSchema = z.object({
  player_id: nullableString,
  game_id: nullableString,
  lifetime: statsRecord.nullish(),
});

export const faceitTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: nullableString,
  expires_in: nullableNumber,
  refresh_token: nullableString,
  scope: nullableString,
  id_token: nullableString,
});

/** Parses external JSON, converting any schema failure into a stable code. */
export function parseFaceit<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new FaceitError("FACEIT_MALFORMED_RESPONSE");
  return result.data;
}

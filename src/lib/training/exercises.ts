/**
 * PM5 / Fase 4.2.9 — curated exercise catalog (`cs2.exercises.v1`).
 *
 * Every exercise is tied to the skill areas it trains, has steps, a duration, a weekly
 * frequency, a completion criterion and the metric that will be re-read at review. Words live
 * in i18n (`exercise.<id>.*`). Equipment is either the game's own offline practice (console
 * commands of CS2's practice mode, `sv_cheats 1` on a private server) or CS2 PRO pages; the only
 * third-party item is the Aim Botz Steam Workshop map, linked with a note that availability can
 * change. Nothing here promises a result.
 */
export const EXERCISES_VERSION = "cs2.exercises.v1";

export type SkillArea =
  | "aim"
  | "dueling"
  | "positioning"
  | "survivability"
  | "utility"
  | "teamplay"
  | "clutch"
  | "decision_making"
  | "economy"
  | "consistency";

export type Equipment = "CS2_PRACTICE" | "CS2_WORKSHOP" | "CS2_DEATHMATCH" | "CS2PRO_REVIEW";

export interface Exercise {
  id: string;
  areas: SkillArea[];
  minutes: number;
  perWeek: number;
  difficulty: 1 | 2 | 3;
  equipment: Equipment;
  steps: number;
  /** Console commands shown verbatim (game commands, not translated). */
  commands: string[];
  /** CS2 PRO page where the exercise is done or its evidence is reviewed. */
  page: "/deaths" | "/rounds" | "/utility" | "/duels" | "/replay" | "/moments" | null;
  /** External reference, shown with "availability may change". */
  reference: string | null;
  /** Metric re-read at review (evolution metric key or a CS2 PRO review count). */
  tracks: string;
  /** false = retired: kept for plan history, never recommended again. */
  available: boolean;
}

const PRACTICE = [
  "sv_cheats 1",
  "bot_kick",
  "mp_roundtime_defuse 60",
  "mp_freezetime 0",
  "sv_infinite_ammo 1",
];
export const AIM_BOTZ = "https://steamcommunity.com/sharedfiles/filedetails/?id=243702660";
export const PRACTICE_COMMANDS_REFERENCE = "https://leetify.com/blog/best-cs2-practice-commands";

export const EXERCISES: readonly Exercise[] = [
  {
    id: "first_bullet_headshots",
    areas: ["aim"],
    minutes: 15,
    perWeek: 3,
    difficulty: 1,
    equipment: "CS2_WORKSHOP",
    steps: 3,
    commands: [],
    page: null,
    reference: AIM_BOTZ,
    tracks: "hsPercent",
    available: true,
  },
  {
    id: "spray_wall",
    areas: ["aim"],
    minutes: 15,
    perWeek: 2,
    difficulty: 2,
    equipment: "CS2_PRACTICE",
    steps: 3,
    commands: [...PRACTICE, "sv_showimpacts 1"],
    page: null,
    reference: PRACTICE_COMMANDS_REFERENCE,
    tracks: "hsPercent",
    available: true,
  },
  {
    id: "crosshair_placement_walk",
    areas: ["aim", "dueling"],
    minutes: 15,
    perWeek: 3,
    difficulty: 1,
    equipment: "CS2_PRACTICE",
    steps: 3,
    commands: ["sv_cheats 1", "bot_kick"],
    page: null,
    reference: null,
    tracks: "openingWinRate",
    available: true,
  },
  {
    id: "counter_strafe",
    areas: ["dueling"],
    minutes: 15,
    perWeek: 3,
    difficulty: 2,
    equipment: "CS2_PRACTICE",
    steps: 3,
    commands: [...PRACTICE, "sv_showimpacts 1"],
    page: null,
    reference: PRACTICE_COMMANDS_REFERENCE,
    tracks: "openingWinRate",
    available: true,
  },
  {
    id: "prefire_angles",
    areas: ["dueling", "positioning"],
    minutes: 20,
    perWeek: 2,
    difficulty: 2,
    equipment: "CS2_PRACTICE",
    steps: 4,
    commands: [...PRACTICE, "bot_stop 1", "bot_place"],
    page: null,
    reference: PRACTICE_COMMANDS_REFERENCE,
    tracks: "openingWinRate",
    available: true,
  },
  {
    id: "death_review",
    areas: ["positioning", "survivability"],
    minutes: 20,
    perWeek: 2,
    difficulty: 1,
    equipment: "CS2PRO_REVIEW",
    steps: 3,
    commands: [],
    page: "/deaths",
    reference: null,
    tracks: "deathsPerRound",
    available: true,
  },
  {
    id: "first_death_replay",
    areas: ["positioning", "survivability"],
    minutes: 20,
    perWeek: 1,
    difficulty: 1,
    equipment: "CS2PRO_REVIEW",
    steps: 3,
    commands: [],
    page: "/rounds",
    reference: null,
    tracks: "deathsPerRound",
    available: true,
  },
  {
    id: "trade_spacing_review",
    areas: ["teamplay", "survivability"],
    minutes: 20,
    perWeek: 1,
    difficulty: 1,
    equipment: "CS2PRO_REVIEW",
    steps: 3,
    commands: [],
    page: "/rounds",
    reference: null,
    tracks: "tradeKillsPerRound",
    available: true,
  },
  {
    id: "utility_lineups",
    areas: ["utility"],
    minutes: 20,
    perWeek: 2,
    difficulty: 2,
    equipment: "CS2_PRACTICE",
    steps: 4,
    commands: [
      "sv_cheats 1",
      "sv_infinite_ammo 1",
      "sv_grenade_trajectory_prac_pipreview 1",
      "sv_rethrow_last_grenade",
      "ammo_grenade_limit_total 6",
    ],
    page: null,
    reference: PRACTICE_COMMANDS_REFERENCE,
    tracks: "flashAssistsPerRound",
    available: true,
  },
  {
    id: "utility_review",
    areas: ["utility"],
    minutes: 15,
    perWeek: 1,
    difficulty: 1,
    equipment: "CS2PRO_REVIEW",
    steps: 3,
    commands: [],
    page: "/utility",
    reference: null,
    tracks: "flashAssistsPerRound",
    available: true,
  },
  {
    id: "clutch_review",
    areas: ["clutch", "decision_making"],
    minutes: 20,
    perWeek: 1,
    difficulty: 2,
    equipment: "CS2PRO_REVIEW",
    steps: 3,
    commands: [],
    page: "/rounds",
    reference: null,
    tracks: "clutchWinRate",
    available: true,
  },
  {
    id: "economy_review",
    areas: ["economy", "decision_making"],
    minutes: 15,
    perWeek: 1,
    difficulty: 1,
    equipment: "CS2PRO_REVIEW",
    steps: 3,
    commands: [],
    page: "/rounds",
    reference: null,
    tracks: "moments.saved",
    available: true,
  },
  {
    id: "warmup_routine",
    areas: ["consistency", "aim"],
    minutes: 15,
    perWeek: 3,
    difficulty: 1,
    equipment: "CS2_DEATHMATCH",
    steps: 3,
    commands: [],
    page: null,
    reference: null,
    tracks: "sessions.done",
    available: true,
  },
];

export function exercisesFor(area: SkillArea): Exercise[] {
  return EXERCISES.filter((e) => e.available && e.areas.includes(area));
}

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

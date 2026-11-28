import type { adaptivePtBR } from "./pt-BR";

export const adaptiveEn: Record<keyof typeof adaptivePtBR, string> = {
  "training.adaptive.catalogHeading": "Recommended catalog courses",
  "training.adaptive.noPromise":
    "The plan organises your practice from your own data; it does not guarantee better performance. Take breaks and fit the volume to your time.",
  "training.adaptive.state.NO_EVIDENCE.title": "No evidence for a plan yet",
  "training.adaptive.state.NO_EVIDENCE.body":
    "No area shows a point to work on with the current data. Upload more demos; no exercise is recommended without evidence.",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.title": "Not enough sample for a plan",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.body":
    "{n} match(es) analysed; the personal plan needs at least {min}.",
  "training.adaptive.history": "Previous plans",
  "training.adaptive.history.subtitle": "History kept; no plan is deleted.",
  "training.adaptive.history.item": "{h}-day plan started on {start}",
  "training.adaptive.score":
    "priority {s} = confidence {c} × (0.6·gap {gap} + 0.25·trend {trend}) + goal {g}",
  "training.adaptive.why": "Why this area: the evidence below, with sample and method.",
  "training.adaptive.evidence.dna": "Player DNA: index {v}/100 (below 60) over {n} matches.",
  "training.adaptive.evidence.trend":
    "{metric}: {v} (measured in {n} of {w} matches); change vs previous period: {d}.",
  "training.adaptive.noComparison": "no valid comparison",
  "training.adaptive.openEvidence": "open evidence",
  "training.adaptive.create.title": "Create a training plan",
  "training.adaptive.create.subtitle":
    "Priorities computed from your matches. You choose the horizon and your availability.",
  "training.adaptive.excluded": "Areas left out:",
  "training.adaptive.exclusion.NOT_MEASURED": "not measured",
  "training.adaptive.exclusion.NO_SIGNAL": "nothing to work on",
  "training.adaptive.exclusion.NO_EXERCISE": "no exercise available",
  "training.adaptive.exclusion.LOW_SAMPLE": "low sample",
  "training.adaptive.horizon": "Horizon",
  "training.adaptive.horizonN": "{n} days",
  "training.adaptive.sessionsPerWeek": "Sessions per week",
  "training.adaptive.minutes": "Minutes per session",
  "training.adaptive.dropAreas": "Leave out of the plan:",
  "training.adaptive.create": "Create plan",
  "training.adaptive.method":
    "Method cs2.training-priority.v1: only areas with evidence (observed DNA below 60 or a decline in a valid comparison), a minimum sample of 3 matches and an available exercise. 7 days = 1 priority, 30 = 2, 90 = 3.",
  "training.adaptive.result.OPEN_PLAN_EXISTS": "An open plan already exists.",
  "training.adaptive.result.NO_EVIDENCE": "Not enough evidence for the plan.",
  "training.adaptive.result.INSUFFICIENT_SAMPLE": "Not enough sample.",
  "training.adaptive.result.NOT_FOUND": "Plan not found.",
  "training.adaptive.result.STALE": "The plan changed since you opened the page; reload.",
  "training.adaptive.result.CLOSED": "This plan is closed.",
  "training.adaptive.plan.title": "{n}-day plan",
  "training.adaptive.plan.subtitle": "{start} – {end} · version {v}",
  "training.adaptive.status.ACTIVE": "active",
  "training.adaptive.status.PAUSED": "paused",
  "training.adaptive.status.COMPLETED": "completed",
  "training.adaptive.status.CANCELLED": "cancelled",
  "training.adaptive.adherence": "Adherence: {done} of {due} sessions due ({p}%)",
  "training.adaptive.adherence.none": "Adherence: no session due yet",
  "training.adaptive.nextReview": "Next review: {d}",
  "training.adaptive.pause": "Pause",
  "training.adaptive.resume": "Resume",
  "training.adaptive.review": "Review plan",
  "training.adaptive.complete": "Complete",
  "training.adaptive.cancel": "Cancel plan",
  "training.adaptive.diff.title": "Proposed revision",
  "training.adaptive.diff.explain":
    "Computed from your current matches. Nothing changes until you accept; done and past sessions stay as they are.",
  "training.adaptive.diff.accept": "Accept new version",
  "training.adaptive.diff.keep": "Keep current plan",
  "training.adaptive.diff.none": "no changes",
  "training.adaptive.diff.reordered": "priority order changed",
  "training.adaptive.diff.evidence": "evidence updated",
  "training.adaptive.priorities": "Priorities and evidence",
  "training.adaptive.priorities.subtitle":
    "Each priority shows its evidence and the formula that ranked it.",
  "training.adaptive.goals": "Goals",
  "training.adaptive.goals.subtitle":
    "Process goals and tracked metrics with their baseline; no number is promised.",
  "training.adaptive.goal.PROCESS_SESSIONS": "Complete at least {n} plan sessions.",
  "training.adaptive.goal.PROCESS_REVIEW_MOMENTS":
    "Save and review at least {n} moments in the library.",
  "training.adaptive.goal.TRACK_METRIC":
    "Track {metric}: baseline {v} ({n} matches). Compared at review, with no numeric target.",
  "training.adaptive.sessions": "Sessions",
  "training.adaptive.sessions.subtitle":
    "Mark each session when you finish or skip it; opening the page does not count as done.",
  "training.adaptive.week": "Week {n}",
  "training.adaptive.versions": "Plan versions",
  "training.adaptive.versions.subtitle":
    "Every change creates a new version; earlier ones are kept.",
  "training.adaptive.versionItem": "Version {v} · {d}",
  "training.adaptive.reason.CREATED": "created",
  "training.adaptive.reason.REVISION": "accepted revision",
  "training.adaptive.reason.USER_EDIT": "player edit",
  "training.adaptive.session.PLANNED": "planned",
  "training.adaptive.session.DONE": "done",
  "training.adaptive.session.SKIPPED": "skipped",
  "training.adaptive.session.SUPERSEDED": "superseded",
  "training.adaptive.exerciseUnavailable": "Exercise unavailable",
  "training.adaptive.minutesN": "{n} min",
  "training.adaptive.howTo": "How to do it",
  "training.adaptive.commands": "Console commands (offline practice server)",
  "training.adaptive.done": "Done when:",
  "training.adaptive.tracks": "Metric re-read at review: {m}",
  "training.adaptive.openPage": "Open in CS2 PRO",
  "training.adaptive.openMoments": "Open my saved moments",
  "training.adaptive.reference": "External reference",
  "training.adaptive.referenceNote": "Third-party content; availability may change.",
  "training.adaptive.durationDone": "Duration (min)",
  "training.adaptive.markDone": "Done",
  "training.adaptive.markSkipped": "Skipped",
  "training.adaptive.undo": "Undo",
  "training.area.aim": "Aim",
  "training.area.dueling": "Duels",
  "training.area.positioning": "First deaths and trades",
  "training.area.survivability": "Survival",
  "training.area.utility": "Utility",
  "training.area.teamplay": "Teamplay (trades)",
  "training.area.clutch": "Clutch",
  "training.area.decision_making": "Decision making",
  "training.area.economy": "Economy",
  "training.area.consistency": "Consistency",
  "training.track.hsPercent": "Headshot %",
  "training.track.openingWinRate": "opening duels won",
  "training.track.deathsPerRound": "deaths per round",
  "training.track.tradeKillsPerRound": "trade kills per round",
  "training.track.flashAssistsPerRound": "flash assists per round",
  "training.track.clutchWinRate": "clutches won",
  "training.track.moments.saved": "moments saved for review",
  "training.track.sessions.done": "sessions done",
  "exercise.first_bullet_headshots.name": "First-bullet headshots (Aim Botz)",
  "exercise.first_bullet_headshots.goal":
    "Practise an accurate first bullet, standing still, without spraying.",
  "exercise.first_bullet_headshots.step1":
    "Open the Aim Botz Steam Workshop map in CS2 (Play → Workshop Maps).",
  "exercise.first_bullet_headshots.step2":
    "With the AK-47 or M4, aim at the head and fire one shot at a time while still; let the crosshair settle.",
  "exercise.first_bullet_headshots.step3":
    "Do 3 sets of 100 kills with a 1-minute rest between sets.",
  "exercise.first_bullet_headshots.criteria": "3 sets of 100 kills, one shot at a time.",
  "exercise.spray_wall.name": "Spray control on a wall",
  "exercise.spray_wall.goal": "Repeat your main rifle's recoil pattern.",
  "exercise.spray_wall.step1":
    "Start a local server (Play → Practice, bots off) and paste the commands in the console.",
  "exercise.spray_wall.step2":
    "About 15 m from a wall, fire a full magazine pulling against the recoil; impacts are marked.",
  "exercise.spray_wall.step3":
    "Repeat 10 magazines with the AK-47 and 10 with the M4, comparing how spread the impacts are.",
  "exercise.spray_wall.criteria": "20 magazines, judging the impacts more grouped over time.",
  "exercise.crosshair_placement_walk.name": "Crosshair placement walk",
  "exercise.crosshair_placement_walk.goal":
    "Keep the crosshair at head height on the angles where an enemy can appear.",
  "exercise.crosshair_placement_walk.step1":
    "On a local server without bots, walk the routes of the map you play most.",
  "exercise.crosshair_placement_walk.step2":
    "Walk slowly keeping the crosshair at head height, against the edge of every angle before you pass it.",
  "exercise.crosshair_placement_walk.step3":
    "Walk the routes of both sides (T and CT); repeat 3 times.",
  "exercise.crosshair_placement_walk.criteria":
    "Three full routes without the crosshair aiming at the floor or at walls with no angle.",
  "exercise.counter_strafe.name": "Counter-strafe",
  "exercise.counter_strafe.goal":
    "Stop your movement before shooting so the first bullet is accurate.",
  "exercise.counter_strafe.step1": "On a local server with the commands, face a wall.",
  "exercise.counter_strafe.step2":
    "Move to one side (A or D), tap the opposite key to stop and fire once; the impacts show whether you stopped.",
  "exercise.counter_strafe.step3": "Do 3 sets of 50 repetitions, alternating sides.",
  "exercise.counter_strafe.criteria":
    "150 repetitions with grouped impacts (no moving-shot spread).",
  "exercise.prefire_angles.name": "Pre-aim common angles",
  "exercise.prefire_angles.goal":
    "Reach angles with the crosshair already placed and eliminate quickly.",
  "exercise.prefire_angles.step1":
    "On a local server with the commands, use bot_place to put still bots on the common angles of a bombsite.",
  "exercise.prefire_angles.step2":
    "Leave spawn and enter the site clearing the angles in order, already aiming where each bot is.",
  "exercise.prefire_angles.step3":
    "Repeat the entry 10 times per site, changing the order of the angles.",
  "exercise.prefire_angles.step4":
    "Do 4 sets; note your time for each clear (bots do not shoot with bot_stop 1).",
  "exercise.prefire_angles.criteria": "20 full entries with the time of each noted.",
  "exercise.death_review.name": "Death review",
  "exercise.death_review.goal": "Understand where and why you die most often.",
  "exercise.death_review.step1": "Open Deaths in CS2 PRO and pick a recent match.",
  "exercise.death_review.step2":
    "Review 5 deaths: check the context, open the replay at the instant and decide whether it was information, positioning or aim.",
  "exercise.death_review.step3":
    "Save as a moment the deaths you want to revisit, with a note on what you would do differently.",
  "exercise.death_review.criteria": "5 deaths reviewed with at least 3 moments saved with a note.",
  "exercise.first_death_replay.name": "Opening-death replay",
  "exercise.first_death_replay.goal": "Review the rounds where you died first.",
  "exercise.first_death_replay.step1":
    'Open Rounds in CS2 PRO and find the rounds tagged "died first".',
  "exercise.first_death_replay.step2":
    "Open the 2D replay a few seconds earlier and watch where the opponent came from and where your teammates were.",
  "exercise.first_death_replay.step3":
    "Write a note on what you would change (position, timing or utility) and save the moment.",
  "exercise.first_death_replay.criteria":
    "Every opening-death round of one match reviewed, with a note.",
  "exercise.trade_spacing_review.name": "Trade and spacing review",
  "exercise.trade_spacing_review.goal":
    "Stay at a distance where a teammate can trade your death (and you theirs).",
  "exercise.trade_spacing_review.step1":
    "In Rounds, look at your untraded deaths and your teammates' trades.",
  "exercise.trade_spacing_review.step2":
    "In the replay, watch the distance and line of sight between you and the nearest teammate at the moment of death.",
  "exercise.trade_spacing_review.step3":
    "Save 3 moments of untraded deaths with a note on where to stand.",
  "exercise.trade_spacing_review.criteria": "3 moments saved with a note on trade positioning.",
  "exercise.utility_lineups.name": "Utility lineups",
  "exercise.utility_lineups.goal": "Learn fixed smoke and flash throws for your map.",
  "exercise.utility_lineups.step1":
    "On a local server with the commands, choose 2 useful smokes and 2 flashes of the map you play most.",
  "exercise.utility_lineups.step2":
    "Use the trajectory preview to land each throw and note the aim and position reference.",
  "exercise.utility_lineups.step3":
    "Use sv_rethrow_last_grenade to repeat and confirm; repeat each throw 10 times.",
  "exercise.utility_lineups.step4": "Test each throw in a bot match, starting from spawn.",
  "exercise.utility_lineups.criteria": "4 throws landed 10 times in a row each.",
  "exercise.utility_review.name": "Utility review",
  "exercise.utility_review.goal": "See whether your grenades blinded, damaged or were wasted.",
  "exercise.utility_review.step1": "Open Utility in CS2 PRO on a recent match.",
  "exercise.utility_review.step2":
    "Look at flashes that blinded teammates or nobody and grenades without damage; open the replay of 3 of them.",
  "exercise.utility_review.step3": "Save 2 throws to fix as moments, with a note.",
  "exercise.utility_review.criteria": "3 throws reviewed and 2 moments saved with a note.",
  "exercise.clutch_review.name": "Clutch review",
  "exercise.clutch_review.goal": "Review decisions when you were alone against opponents.",
  "exercise.clutch_review.step1": "In Rounds, open the clutch (1vN) rounds of your latest matches.",
  "exercise.clutch_review.step2":
    "In the replay, note the time left, the bomb situation and where you chose to play.",
  "exercise.clutch_review.step3":
    "Write an alternative as a hypothesis (not a certainty) and save the moment.",
  "exercise.clutch_review.criteria": "Every clutch of 2 matches reviewed with a note.",
  "exercise.economy_review.name": "Economy review",
  "exercise.economy_review.goal": "Understand the team's buys and your own in each round.",
  "exercise.economy_review.step1":
    "In Rounds, on a match with measured buys, look at the team's and your own buy per round.",
  "exercise.economy_review.step2":
    "Mark the rounds where your buy differed from the team's (mixed buy) and the result.",
  "exercise.economy_review.step3": "Save 2 moments of buy decisions to discuss with your team.",
  "exercise.economy_review.criteria":
    "1 match reviewed and 2 moments saved (only on matches with spend recorded).",
  "exercise.warmup_routine.name": "Warm-up routine",
  "exercise.warmup_routine.goal": "Start every play session with the same short routine.",
  "exercise.warmup_routine.step1": "5 minutes on Aim Botz (first-bullet headshots).",
  "exercise.warmup_routine.step2":
    "10 minutes of Deathmatch focusing on crosshair placement and counter-strafing.",
  "exercise.warmup_routine.step3": "Note how you felt before the day's first match.",
  "exercise.warmup_routine.criteria": "Routine done before playing, on the planned days.",
};

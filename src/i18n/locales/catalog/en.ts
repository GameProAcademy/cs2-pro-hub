import type { catalogPtBR } from "./pt-BR";

export const catalogEn: Record<keyof typeof catalogPtBR, string> = {
  "admin.nav.catalog": "Course catalog",
  "catalog.admin.title": "Course and lesson catalog",
  "catalog.admin.subtitle":
    "Single source of the courses and lessons used by My Training and the AI Coach. Only active items with a confirmed language and a classified track are recommended.",
  "catalog.admin.tab.lessons": "Lessons",
  "catalog.admin.tab.groups": "Tracks and groups",
  "catalog.admin.tab.import": "Import",
  "catalog.admin.search": "Search by title or URL",
  "catalog.admin.all": "All",
  "catalog.admin.col.title": "Title",
  "catalog.admin.col.locale": "Language",
  "catalog.admin.col.status": "Language status",
  "catalog.admin.col.track": "Track",
  "catalog.admin.col.topics": "Topics",
  "catalog.admin.col.lessons": "Lessons",
  "catalog.admin.col.courses": "Courses",
  "catalog.admin.col.source": "Classification source",
  "catalog.admin.status.confirmed": "Confirmed",
  "catalog.admin.status.pending": "Pending validation",
  "catalog.admin.active": "Active",
  "catalog.admin.inactive": "Inactive",
  "catalog.admin.edit": "Edit",
  "catalog.admin.save": "Save",
  "catalog.admin.cancel": "Cancel",
  "catalog.admin.activate": "Activate",
  "catalog.admin.deactivate": "Deactivate",
  "catalog.admin.delete": "Delete",
  "catalog.admin.confirmDelete":
    "Delete this lesson permanently? Prefer deactivating if it may come back.",
  "catalog.admin.field.url": "URL",
  "catalog.admin.field.topicsHint": "Comma-separated codes (e.g. utility, aim, positioning)",
  "catalog.admin.saved": "Change saved.",
  "catalog.admin.error":
    "Could not save. Check the URL (hub.gamepro.academy only, never sample-course) and whether it already exists in the catalog.",
  "catalog.admin.empty": "No item matches these filters.",
  "catalog.track.counter_strike_in_game": "Counter-Strike Training",
  "catalog.track.strategic_knowledge": "Strategic Knowledge",
  "catalog.track.extra_skills": "Extra Skills",
  "catalog.track.unclassified": "Unclassified",
  "catalog.admin.import.help":
    "Upload training_catalog.json or the CSVs (courses and/or lessons). Simulate first: nothing is written. Applying inserts new items and updates changes; nothing missing from the file is deleted, and decisions made here (language, track) are preserved.",
  "catalog.admin.import.json": "Catalog JSON file",
  "catalog.admin.import.coursesCsv": "Courses CSV (optional)",
  "catalog.admin.import.lessonsCsv": "Lessons CSV (optional)",
  "catalog.admin.import.simulate": "Simulate import",
  "catalog.admin.import.apply": "Apply import",
  "catalog.admin.import.report": "Report",
  "catalog.admin.import.inserted": "new",
  "catalog.admin.import.updated": "updated",
  "catalog.admin.import.unchanged": "unchanged",
  "catalog.admin.import.notInFile": "stored but not in the file (kept)",
  "catalog.admin.import.rejected": "rejected",
  "catalog.admin.import.pending": "lessons with pending language",
  "catalog.admin.import.simulated": "Simulation: nothing was written.",
  "catalog.admin.import.applied": "Import applied.",
  "catalog.admin.import.failed":
    "Import refused. The file could not be read or is too large (max 5 MB).",
  "training.real.noPlayer":
    "No player is linked to your account yet. Upload a demo and confirm which player you are to generate the plan.",
  "training.real.noData":
    "No processed matches yet. The plan only uses your real data; upload a demo to start.",
  "training.real.noPriority":
    "None of your Player DNA dimensions is below 60 / 100 and you have not declared goals in your profile: there is no priority to fix. Keep your routine and set a goal in your profile to get recommendations.",
  "training.real.provisional":
    "Small sample ({matches} match(es)): priorities are provisional and will be revised with every new demo.",
  "training.real.catalogUnavailable":
    "The lesson catalog is unavailable right now; the plan shows practice activities only.",
  "training.real.goals": "Your goals",
  "training.real.noGoals": "No goal declared in your profile.",
  "training.real.priorities": "Priorities (lowest dimensions of your Player DNA)",
  "training.real.week": "Week",
  "training.real.focusConsolidation": "Consolidation and review",
  "training.real.practice": "Practice in CS2",
  "training.real.lessons": "Recommended lessons",
  "training.real.complementary": "Complementary tracks",
  "training.real.complementaryHint":
    "Content from other tracks linked to your priorities. Suggestion: one lesson per week.",
  "training.real.frequency": "Suggestion: 3 to 4 sessions per week, in this order.",
  "training.real.open": "Open lesson",
  "training.real.openCourse": "Open course",
  "training.real.why.dna": "Your {dimension} dimension is at {value}.",
  "training.real.why.goal": "Linked to your goal: {goal}.",
  "training.real.why.map": "Positions on {map}, a map you played.",
  "training.real.noLesson": "No catalog lesson for this priority in your language.",
  "training.practice.aim":
    "15 min of aim_botz keeping the crosshair at head height + 10 min of deathmatch with one-taps only.",
  "training.practice.dueling":
    "Peek practice (wide and jiggle) on a training map and review of your opening duels in the demo.",
  "training.practice.survivability":
    "In each match, note the untraded deaths and review the position of each one in the demo.",
  "training.practice.positioning":
    "Practice the standard positions of the maps you play, CT and T side, on a local server.",
  "training.practice.utility":
    "Learn 3 execute smokes and 2 flashes for your main map and use them every match.",
  "training.practice.decision_making":
    "After each lost round, write one line on which decision would have changed the outcome.",
  "training.practice.teamplay":
    "Agree on trades and team flashes with your team; check in the demo whether the trade happened.",
  "training.practice.economy": "Before each round, call out full buy, force or eco with your team.",
  "training.practice.clutch":
    "Practice 1v1 and 1v2 situations on a retake server, prioritizing information before shooting.",
  "training.practice.consistency":
    "Same 20-min warm-up before every session (aim, spray, deathmatch) and at most 3 matches in a row.",
  "training.practice.demo_review":
    "Watch your latest demo and mark 3 rounds to fix; compare with week 1.",
  "coach.catalog.label": "Recommended lesson",
};

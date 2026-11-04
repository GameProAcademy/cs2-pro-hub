import type { uxPtBR } from "./pt-BR";

export const uxEn: Record<keyof typeof uxPtBR, string> = {
  "common.notAvailable": "Not available",
  "common.notAvailableHint": "Not enough data",
  "glossary.title": "Metrics glossary",
  "glossary.description": "What each number means and how CS2 PRO calculates it.",
  "glossary.open": "What is {term}?",

  "glossary.kd.label": "K/D",
  "glossary.kd.short": "K/D",
  "glossary.kd.definition":
    "Kills divided by deaths. For the overall average we add up the kills and deaths of every match that has this data.",
  "glossary.adr.label": "ADR (average damage per round)",
  "glossary.adr.short": "ADR",
  "glossary.adr.definition":
    "Damage dealt to enemies divided by the rounds you played. Shown only when the demo includes damage events.",
  "glossary.kast.label": "KAST",
  "glossary.kast.short": "KAST",
  "glossary.kast.definition":
    "Share of rounds in which you got a kill (K), an assist (A, flash assists included), provably survived (S) or were traded (T: a teammate killed your killer within {tradeWindow} s).",
  "glossary.hsPercent.label": "HS% (headshots)",
  "glossary.hsPercent.short": "HS%",
  "glossary.hsPercent.definition": "Share of your kills that were headshots.",
  "glossary.rating.label": "Match rating",
  "glossary.rating.short": "Rating",
  "glossary.rating.definition":
    "A relative indicator for a single match, calculated by CS2 PRO from kills per round, deaths per round and ADR. Higher means a better performance in that match. It is not the HLTV Rating or the CS2 PRO Score.",
  "glossary.winRate.label": "Win rate",
  "glossary.winRate.short": "Wins",
  "glossary.winRate.definition":
    "Wins divided by matches that ended in a win or a loss. Draws and matches without a result are not counted.",
  "glossary.openingKills.label": "Opening kills (entry)",
  "glossary.openingKills.short": "Openings",
  "glossary.openingKills.definition":
    "Rounds in which you got the first kill of the round. Rounds where the order of kills cannot be determined are left out.",
  "glossary.openingDeaths.label": "Opening deaths",
  "glossary.openingDeaths.short": "Opening deaths",
  "glossary.openingDeaths.definition":
    "Rounds in which you were the first death of the round. Rounds where the order of kills cannot be determined are left out.",
  "glossary.tradeKills.label": "Trade kills",
  "glossary.tradeKills.short": "Trades",
  "glossary.tradeKills.definition":
    "Kills where you killed an enemy who had just killed a teammate of yours, within {tradeWindow} s, in the same round.",
  "glossary.flashAssists.label": "Flash assists",
  "glossary.flashAssists.short": "Flash assists",
  "glossary.flashAssists.definition":
    "Teammates' kills on a victim you blinded with a flash. We use the game's own flag; when the demo lacks it, your flash counts if it blinded the victim up to {flashWindow} s before the kill.",
  "glossary.clutch.label": "Clutch",
  "glossary.clutch.short": "Clutch",
  "glossary.clutch.definition":
    "A situation where you are the last one alive on your team against one or more living enemies. Without kill events it cannot be known, and the value is unavailable.",
  "glossary.utility.label": "Utility",
  "glossary.utility.short": "Utility",
  "glossary.utility.definition": "Grenades: HE, flash, smoke, molotov/incendiary and decoy.",
  "glossary.proScore.label": "CS2 PRO Score",
  "glossary.proScore.short": "PRO Score",
  "glossary.proScore.definition":
    "CS2 PRO's overall performance score. It is not calculated yet: it will be shown only once its formula, weights and minimum sample are validated.",

  "real.proScoreContext.body":
    "The CS2 PRO Score is not calculated yet. It will appear only once its formula, weights and minimum number of matches are validated, and it will never be an estimate.",
  "real.proScoreContext.instead":
    "Meanwhile, follow the metrics measured in your matches on this page. The rating in the matches table applies to each single match only and does not replace the CS2 PRO Score.",
  "real.proScore.where": "Learn more in Performance",
  "training.real.accessNote":
    "Lessons open on the GamePro course platform (hub.gamepro.academy) in a new tab. Access to each lesson is controlled by your account on that platform, and your progress is kept there: CS2 PRO does not track lesson progress.",
};

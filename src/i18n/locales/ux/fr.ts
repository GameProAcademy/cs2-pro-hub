import type { uxPtBR } from "./pt-BR";

export const uxFr: Record<keyof typeof uxPtBR, string> = {
  "common.notAvailable": "Non disponible",
  "common.notAvailableHint": "Données insuffisantes",
  "glossary.title": "Glossaire des statistiques",
  "glossary.description": "Ce que signifie chaque nombre et comment CS2 PRO le calcule.",
  "glossary.open": "Qu’est-ce que {term} ?",

  "glossary.kd.label": "K/D",
  "glossary.kd.short": "K/D",
  "glossary.kd.definition":
    "Éliminations divisées par les morts. Pour la moyenne globale, nous additionnons les éliminations et les morts de tous les matchs qui disposent de ces données.",
  "glossary.adr.label": "ADR (dégâts moyens par round)",
  "glossary.adr.short": "ADR",
  "glossary.adr.definition":
    "Dégâts infligés aux ennemis divisés par le nombre de rounds joués. Affiché uniquement si la démo contient les événements de dégâts.",
  "glossary.kast.label": "KAST",
  "glossary.kast.short": "KAST",
  "glossary.kast.definition":
    "Part des rounds où vous avez fait une élimination (K), une assistance (A, flashs comprises), survécu de façon prouvée (S) ou été vengé (T : un coéquipier a éliminé votre tueur en {tradeWindow} s maximum).",
  "glossary.hsPercent.label": "HS% (headshots)",
  "glossary.hsPercent.short": "HS%",
  "glossary.hsPercent.definition": "Part de vos éliminations réalisées d’un tir à la tête.",
  "glossary.rating.label": "Rating du match",
  "glossary.rating.short": "Rating",
  "glossary.rating.definition":
    "Indicateur relatif d’un seul match, calculé par CS2 PRO à partir des éliminations par round, des morts par round et de l’ADR. Plus il est élevé, meilleure est la performance sur ce match. Ce n’est ni le HLTV Rating ni le CS2 PRO Score.",
  "glossary.winRate.label": "Taux de victoire",
  "glossary.winRate.short": "Victoires",
  "glossary.winRate.definition":
    "Victoires divisées par les matchs terminés par une victoire ou une défaite. Les égalités et les matchs sans résultat ne sont pas comptés.",
  "glossary.openingKills.label": "Éliminations d’ouverture (entry)",
  "glossary.openingKills.short": "Ouvertures",
  "glossary.openingKills.definition":
    "Rounds où vous avez fait la première élimination du round. Les rounds où l’ordre des éliminations est indéterminable sont exclus.",
  "glossary.openingDeaths.label": "Morts d’ouverture",
  "glossary.openingDeaths.short": "Morts d’ouverture",
  "glossary.openingDeaths.definition":
    "Rounds où vous avez été la première mort du round. Les rounds où l’ordre des éliminations est indéterminable sont exclus.",
  "glossary.tradeKills.label": "Trade kills",
  "glossary.tradeKills.short": "Trades",
  "glossary.tradeKills.definition":
    "Éliminations d’un ennemi qui venait d’éliminer un de vos coéquipiers, en {tradeWindow} s maximum, dans le même round.",
  "glossary.flashAssists.label": "Assistances flash",
  "glossary.flashAssists.short": "Flash assists",
  "glossary.flashAssists.definition":
    "Éliminations de coéquipiers sur une victime que vous avez aveuglée avec une flash. Nous utilisons le marquage du jeu ; à défaut, votre flash compte si elle a aveuglé la victime jusqu’à {flashWindow} s avant l’élimination.",
  "glossary.clutch.label": "Clutch",
  "glossary.clutch.short": "Clutch",
  "glossary.clutch.definition":
    "Situation où vous êtes le dernier survivant de votre équipe face à un ou plusieurs ennemis en vie. Sans les événements d’élimination, c’est impossible à savoir et la valeur n’est pas disponible.",
  "glossary.utility.label": "Utilitaires",
  "glossary.utility.short": "Utility",
  "glossary.utility.definition": "Grenades : HE, flash, fumigène, molotov/incendiaire et leurre.",
  "glossary.proScore.label": "CS2 PRO Score",
  "glossary.proScore.short": "PRO Score",
  "glossary.proScore.definition":
    "Indice de 0 à 100 de votre performance mesurée sur les matchs complets : moyenne pondérée du KAST, des dégâts et éliminations par round, de l’équilibre éliminations / morts, de la survie, des duels d’ouverture et des clutchs. Ce n’est ni un percentile ni une comparaison avec d’autres joueurs.",

  "real.proScoreContext.body":
    "Le CS2 PRO Score résume votre performance mesurée en un indice de 0 à 100. Il n’apparaît qu’avec au moins 3 matchs complets et une couverture suffisante, et ce n’est jamais une estimation.",
  "real.proScoreContext.instead":
    "Le rating affiché dans le tableau des matchs ne vaut que pour chaque match isolé et ne remplace pas le CS2 PRO Score.",
  "real.proScore.where": "En savoir plus dans Performance",
  "training.real.accessNote":
    "CS2 PRO se contente de recommander des leçons du catalogue GamePro, choisies à partir de vos matchs et de vos objectifs, et d’afficher le lien. La leçon s’ouvre sur hub.gamepro.academy, dans un nouvel onglet, avec votre propre identifiant sur cette plateforme. CS2 PRO ne reçoit aucune information de sa part : il ne sait pas si vous avez ouvert, regardé ou terminé une leçon, et rien de tout cela n’entre dans vos statistiques ni dans vos recommandations.",
};

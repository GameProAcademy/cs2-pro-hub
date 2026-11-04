import type { xrayPtBR } from "./pt-BR";

export const xrayFr: Record<keyof typeof xrayPtBR, string> = {
  "real.result.unresolved": "Non déterminé par la démo",
  "real.result.unresolvedNote":
    "Résultat et score : la démo n’a pas identifié l’équipe de chaque joueur, donc CS2 PRO ne détermine ni victoire ni défaite (limitation L04 de l’admission). Aucun résultat n’est estimé.",
  "real.date.processed": "traité le",
  "real.date.processedNote":
    "Date : les démos de CS2 n’enregistrent pas quand le match a été joué. Si le match n’a pas de date propre, nous affichons la date à laquelle CS2 PRO l’a traité.",
  "real.winRate.sample": "{wins} sur {decided} match(s) avec un résultat",
  "real.winRate.unresolved": "Aucun des {n} match(s) n’a de résultat déterminé par la démo",

  "real.dna.inFormation": "En formation",
  "real.dna.inFormationIndex": "Indice en formation ({matches} sur {minimum} matchs)",
  "real.dna.radarInFormation":
    "Le radar et les indices par dimension apparaissent à partir de {minimum} matchs. Les signaux ci-dessous sont réels.",
  "real.dna.history.title": "Évolution du Player DNA",
  "real.dna.history.description":
    "Chaque ligne est un snapshot enregistré quand vos matchs ont changé. Les anciens snapshots ne sont jamais écrasés.",
  "real.dna.history.empty": "Aucun snapshot enregistré pour l’instant.",
  "real.dna.history.date": "Date",
  "real.dna.history.matches": "Matchs",
  "real.dna.history.state": "État",
  "real.dna.history.READY": "Échantillon minimal atteint",
  "real.dna.history.INSUFFICIENT_SAMPLE": "En formation",
  "real.dna.dashboard.inFormation":
    "En formation : {matches} sur {minimum} matchs pour un profil stable.",
  "real.dna.dashboard.ready": "Profil sur {matches} matchs avec {observed} dimensions observées.",
  "real.dna.dashboard.empty": "Pas encore de match avec des signaux de Player DNA.",
  "real.dna.open": "Voir le Player DNA",

  "xray.sample":
    "Base : {matches} match(s), {rounds} rounds joués. Résultat connu pour {decided} match(s).",
  "xray.inFormation":
    "Rayon X en formation : {matches} sur {minimum} matchs. Les observations sont réelles ; inférences et recommandations apparaissent une fois l’échantillon minimal atteint.",
  "xray.empty": "Le Rayon X apparaît dès qu’au moins un match traité contient vos données.",
  "xray.layer.observed": "Observé",
  "xray.layer.observedHint": "Valeurs mesurées dans vos matchs, chacune avec son échantillon.",
  "xray.layer.inference": "Inférence",
  "xray.layer.inferenceHint":
    "Lecture des observations selon une règle documentée : les dimensions du Player DNA à l’indice le plus bas, sous {ceiling}/100.",
  "xray.layer.recommendation": "Recommandation",
  "xray.layer.recommendationHint":
    "Ce qu’il faut travailler, relié à votre plan d’entraînement. Aucune leçon n’est choisie ici.",
  "xray.dim.aim_duels": "Visée et duels",
  "xray.dim.survival_positioning": "Survie et placement",
  "xray.dim.utility": "Utilitaires",
  "xray.dim.impact": "Impact sur le round",
  "xray.dim.consistency": "Régularité",
  "xray.dim.decision": "Prise de décision",
  "xray.dim.notObserved": "Aucune donnée observée dans cette dimension.",
  "xray.status.NOT_MEASURED": "Non mesuré",
  "xray.status.EXCLUDED_BY_ADMISSION": "Exclu par l’admission de la démo",
  "xray.inMatches": "sur {n} match(s)",
  "xray.dnaIndex": "Indice DNA",
  "xray.metric.kills": "Éliminations",
  "xray.metric.deaths": "Morts",
  "xray.metric.utilityDamage": "Dégâts de grenades",
  "xray.metric.clutchWins": "Clutchs gagnés",
  "xray.metric.ctRating": "Rating côté CT",
  "xray.metric.tRating": "Rating côté T",
  "xray.sides.title": "Côtés CT et T",
  "xray.sides.description":
    "Rounds joués de chaque côté et rating du match limité à ces rounds. Les éliminations et les dégâts par côté ne sont pas encore enregistrés par round.",
  "xray.sides.ct": "CT",
  "xray.sides.t": "T",
  "xray.sides.rounds": "{n} rounds",
  "xray.inference.item": "{dimension} : indice {index}/100 (sous {ceiling})",
  "xray.inference.NO_DATA": "Aucun match avec des signaux de Player DNA.",
  "xray.inference.INSUFFICIENT_SAMPLE":
    "Pas d’inférence : le Player DNA compte {matches} matchs sur les {minimum} minimum.",
  "xray.inference.NONE_BELOW_CEILING": "Aucune dimension observée n’est sous {ceiling}/100.",
  "xray.recommendation.item": "Donner la priorité à {dimension} à l’entraînement.",
  "xray.recommendation.none": "Pas de recommandation sans inférence.",
  "xray.recommendation.open": "Ouvrir le plan d’entraînement",
  "xray.unsupported.title": "Ce que CS2 PRO ne mesure pas encore",
  "xray.unsupported.enemiesFlashed":
    "Ennemis aveuglés (les démos n’enregistrent pas qui a été aveuglé).",
  "xray.unsupported.positions": "Positions et cartes de chaleur (coordonnées non extraites).",
  "xray.unsupported.economyClassification":
    "Classification des achats (eco, force, full) : pas de classificateur validé.",
  "xray.unsupported.sideSplitKills": "Éliminations et dégâts par côté (non enregistrés par round).",
};

/** CS2 PRO Score (pro-score-v1) — fr. */
export const scoreFr = {
  "score.of100": "{score} / 100",
  "score.loading": "Calcul…",
  "score.state.EMPTY": "Aucun match traité pour l’instant. Envoyez une démo pour commencer.",
  "score.state.INSUFFICIENT_SAMPLE":
    "Pas encore calculé : {matches} match(s) complet(s) sur {minimum}. Aucune valeur n’est estimée.",
  "score.state.INSUFFICIENT_COVERAGE":
    "Pas encore calculé : seulement {coverage} % du poids du Score a été mesuré dans vos matchs (minimum {min} %).",
  "score.basis": "Calculé sur {matches} match(s) complet(s) et {rounds} rounds. Méthode {version}.",
  "score.partialExcluded": "{n} match(s) lu(s) partiellement ont été exclus du calcul.",
  "score.confidence.label": "Confiance de l’échantillon",
  "score.confidence.PROVISIONAL":
    "Provisoire (moins de {moderate} rounds) : la valeur peut encore beaucoup varier avec de nouveaux matchs",
  "score.confidence.MODERATE": "Modérée ({moderate} à {high} rounds)",
  "score.confidence.HIGH": "Élevée ({high} rounds ou plus)",
  "score.coverage": "Couverture : {coverage} % du poids mesuré",
  "score.notPercentile":
    "C’est un indice absolu CS2 PRO. Ce n’est ni un percentile ni une comparaison avec d’autres joueurs, et 50 ne signifie pas « dans la moyenne ».",
  "score.details": "Voir comment il est calculé",
  "score.components.title": "Comment votre Score est formé",
  "score.col.component": "Composante",
  "score.col.value": "Votre valeur",
  "score.col.sample": "Échantillon",
  "score.col.weight": "Poids",
  "score.col.points": "Points",
  "score.c.round_contribution": "KAST (contribution par round)",
  "score.c.damage": "Dégâts par round (ADR ÷ 100)",
  "score.c.kills": "Éliminations par round",
  "score.c.duel_balance": "Équilibre éliminations / morts",
  "score.c.survival": "Survie",
  "score.c.opening": "Duels d’ouverture gagnés",
  "score.c.clutch": "Clutchs gagnés",
  "score.unavailable.NOT_OBSERVED": "Non mesuré : exclu du calcul",
  "score.unavailable.THIN_SAMPLE": "Moins de {min} événements : exclu du calcul",
  "score.sample.rounds": "{n} rounds",
  "score.sample.opening_duels": "{n} duel(s)",
  "score.sample.clutches": "{n} clutch(s)",
  "score.method":
    "Moyenne pondérée de sept signaux de performance mesurés dans vos matchs complets, en cumulant tous les matchs pondérés par leur propre échantillon. Une composante non mesurée ne devient pas zéro : elle sort du calcul et son poids est redistribué. Avec moins de {minimum} matchs complets ou moins de {minCoverage} % de couverture, le Score n’est pas affiché. Les poids sont un choix de conception de cette version, pas un ajustement statistique.",
  "score.dnaDifference":
    "Le Score résume la performance. Le Player DNA décrit votre style et vos habitudes ; les signaux de style n’entrent pas dans le Score.",
} as const;

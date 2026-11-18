import type { evolutionPtBR } from "./pt-BR";

export const evolutionFr: Record<keyof typeof evolutionPtBR, string> = {
  "nav.evolution": "Évolution",
  "evolution.eyebrow": "Évolution et régularité",
  "evolution.title": "Votre évolution",
  "evolution.description":
    "Fenêtres de vos derniers matchs, régularité match par match et comparaison avec la période précédente. Tout est descriptif et indique combien de matchs soutiennent chaque chiffre.",
  "evolution.empty.title": "Aucun match pour l'instant",
  "evolution.empty.description": "Envoyez des démos pour suivre votre évolution.",
  "evolution.filter.window": "Fenêtre",
  "evolution.filter.windowN": "{n} derniers",
  "evolution.filter.map": "Carte",
  "evolution.filter.allMaps": "Toutes les cartes",
  "evolution.filter.side": "Côté",
  "evolution.side.ALL": "Les deux",
  "evolution.side.CT": "CT",
  "evolution.side.T": "T",
  "evolution.windowN":
    "Fenêtre : {n} match(s) sur {requested} demandés ({total} éligibles au total).",
  "evolution.window.partial":
    "Il y a moins de matchs que la taille de la fenêtre ; les chiffres n'utilisent que les matchs existants.",
  "evolution.window.insufficient":
    "Moins de {min} matchs : échantillon insuffisant pour afficher la fenêtre.",
  "evolution.excluded":
    "{n} match(s) sans nombre de rounds ont été écartés (aucun taux par round ne peut y être calculé).",
  "evolution.sideOnlyRating":
    "Seul le rating est enregistré par côté (CT/T) ; les autres métriques ne sont pas mesurées par côté.",
  "evolution.weaponNote":
    "L'évolution par arme n'est pas mesurée dans l'historique par match ; voyez armes et duels par match dans Combat.",
  "evolution.section.metrics": "Métriques de la fenêtre",
  "evolution.section.metrics.subtitle":
    "Valeur de la fenêtre, régularité entre matchs et comparaison avec les matchs précédents.",
  "evolution.col.metric": "Métrique",
  "evolution.col.window": "Fenêtre",
  "evolution.col.consistency": "Régularité",
  "evolution.col.comparison": "Comparaison",
  "evolution.method":
    "Méthode {version}. Taux cumulés par numérateur et dénominateur. La régularité exige {consistency} matchs et ne reçoit pas d'étiquette. Une comparaison exige {compare} matchs par période et la même méthode.",
  "evolution.section.chart": "Match par match",
  "evolution.section.chart.subtitle":
    "Valeur de chaque match de la fenêtre ; les matchs sans mesure sont un trou, jamais un zéro.",
  "evolution.chart.axis": "Axe vertical : {unit}. Axe horizontal : date du match.",
  "evolution.notMeasured": "non mesuré",
  "evolution.openRounds": "Voir les rounds",
  "evolution.notCausal":
    "Les variations entre périodes sont descriptives : elles n'indiquent pas la cause (entraînement, carte, adversaires ou hasard).",
  "evolution.aggregation.POOLED_RATIO": "somme des numérateurs / dénominateurs",
  "evolution.aggregation.MEAN_PER_MATCH": "moyenne par match",
  "evolution.coverage": "mesurée dans {n} matchs sur {total}",
  "evolution.status.OK": "ok",
  "evolution.status.NO_SAMPLE": "non mesuré dans la fenêtre",
  "evolution.status.INCOMPATIBLE_METHODS": "méthodes différentes dans la fenêtre — non cumulées",
  "evolution.consistency.median": "médiane {v} (IQR {q1}–{q3})",
  "evolution.consistency.sd": "écart type {sd} · CV {cv}",
  "evolution.consistency.insufficient": "échantillon insuffisant ({n} sur {min} matchs)",
  "evolution.comparison.n": "{recent} matchs récents × {previous} précédents",
  "evolution.comparison.OK": "ok",
  "evolution.comparison.INSUFFICIENT_SAMPLE":
    "échantillon insuffisant (au moins {min} matchs par période)",
  "evolution.comparison.INCOMPATIBLE_METHODS":
    "méthodes différentes entre les périodes — non comparable",
  "evolution.comparison.NO_PREVIOUS_PERIOD": "pas de période précédente",
  "evolution.dna.title": "Player DNA",
  "evolution.dna.subtitle":
    "Le DNA utilise ses propres snapshots versionnés et n'est affiché en entier qu'avec un échantillon suffisant.",
  "evolution.dna.ready": "DNA prêt avec {n} matchs (snapshot du {date}).",
  "evolution.dna.insufficient": "DNA avec échantillon insuffisant : {n} sur {min} matchs.",
  "evolution.dna.open": "Ouvrir le Player DNA",
  "evolution.metric.kd": "K/D",
  "evolution.metric.adr": "Dégâts par round (ADR)",
  "evolution.metric.kast": "KAST",
  "evolution.metric.hsPercent": "Headshot %",
  "evolution.metric.rating": "Rating",
  "evolution.metric.openingWinRate": "Ouvertures gagnées",
  "evolution.metric.deathsPerRound": "Morts par round",
  "evolution.metric.tradeKillsPerRound": "Éliminations d'échange par round",
  "evolution.metric.clutchWinRate": "Clutches gagnés",
  "evolution.metric.flashAssistsPerRound": "Flash assists par round",
  "evolution.unit.RATIO": "ratio (éliminations par mort)",
  "evolution.unit.PERCENT": "pourcentage",
  "evolution.unit.PER_ROUND": "par round",
  "evolution.unit.DAMAGE_PER_ROUND": "dégâts par round",
  "evolution.unit.RATING": "rating",
};

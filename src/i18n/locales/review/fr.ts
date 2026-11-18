import type { reviewPtBR } from "./pt-BR";

export const reviewFr: Record<keyof typeof reviewPtBR, string> = {
  "review.title": "Revue mensuelle (aperçu)",
  "review.subtitle": "Résumé du mois à partir de vos données (cs2.monthly-review.v1)",
  "review.noMatches": "Aucun match ce mois-ci.",
  "review.matches": "{n} matchs ce mois-ci.",
  "review.lowSample":
    "{n} match(s) ce mois-ci : petit échantillon (moins de {min}) ; lisez les chiffres avec prudence.",
  "review.processedDates": "Certaines dates sont des dates de traitement, pas de match.",
  "review.nMatches": "{n} matchs",
  "review.vsPrevious": "mois précédent {v} ({n} matchs)",
  "review.comparison.INSUFFICIENT_SAMPLE": "pas de comparaison (échantillon insuffisant)",
  "review.comparison.INCOMPATIBLE_METHODS": "pas de comparaison (méthodes différentes)",
  "review.comparison.NO_PREVIOUS_MONTH": "aucun match le mois précédent",
  "review.training":
    "Entraînement : {done} séances faites et {skipped} sautées, sur {due} prévues.",
  "review.noPlan": "Aucun plan d'entraînement ouvert.",
  "review.moments": "{n} moment(s) enregistré(s) ce mois-ci.",
  "review.notSent":
    "Aperçu sur cette page uniquement : rien n'est envoyé par e-mail ou message. Un envoi exigerait votre consentement explicite, pas encore disponible.",
};

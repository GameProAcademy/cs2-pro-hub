import type { benchmarksPtBR } from "./pt-BR";

export const benchmarksFr: Record<keyof typeof benchmarksPtBR, string> = {
  "benchmarks.title": "Comparaison avec les professionnels",
  "benchmarks.subtitle": "Benchmarks professionnels (cs2.pro-benchmark.v1)",
  "benchmarks.unavailable.title": "Indisponible.",
  "benchmarks.unavailable.body":
    "Aucune source de données de joueurs professionnels CS2 n'est licenciée pour cet usage et calculée comme vos métriques. Aucune moyenne professionnelle n'est donc affichée ni estimée.",
  "benchmarks.available": "{n} source(s) licenciée(s) et comparable(s) disponible(s).",
  "benchmarks.rules":
    "Une source n'est utilisée qu'avec une licence vérifiée autorisant l'affichage de données dérivées, une collecte autorisée (jamais de scraping), des données CS2, la même méthode que vos métriques et au moins {min} matchs.",
  "benchmarks.audit": "Sources examinées et pourquoi elles ne sont pas utilisées",
  "benchmarks.finding.NO_LICENSE_FOUND": "aucune licence pour cet usage trouvée",
  "benchmarks.finding.TERMS_RESTRICT_REUSE":
    "les conditions restreignent la réutilisation des données",
  "benchmarks.finding.SCRAPED_ORIGIN": "données collectées par scraping",
  "benchmarks.finding.NO_PRO_DATASET": "n'offre pas de jeu de données professionnel",
  "benchmarks.finding.OWN_PLAYER_DATA_ONLY": "données du joueur uniquement",
};

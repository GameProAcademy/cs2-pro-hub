import type { spatialPtBR } from "./pt-BR";

export const spatialFr: Record<keyof typeof spatialPtBR, string> = {
  "nav.maps": "Cartes",
  "spatial.eyebrow": "Intelligence de la carte",
  "spatial.title": "Où vous mourez et où vous éliminez",
  "spatial.description":
    "Positions enregistrées au tick de chaque mort, par carte, camp et couche. Cliquez sur une cellule pour voir les rounds.",
  "spatial.filter.map": "Carte",
  "spatial.filter.match": "Match",
  "spatial.filter.allMatches": "Tous les matchs sur cette carte ({n})",
  "spatial.filter.layer": "Couche",
  "spatial.filter.side": "Camp",
  "spatial.filter.level": "Niveau de la carte",
  "spatial.filter.weapon": "Arme",
  "spatial.filter.allWeapons": "Toutes les armes",
  "spatial.side.ALL": "Les deux",
  "spatial.side.CT": "CT",
  "spatial.side.T": "T",
  "spatial.side.UNKNOWN": "Camp inconnu",
  "spatial.level.default": "Supérieur",
  "spatial.level.lower": "Inférieur",
  "spatial.layer.DEATHS": "Vos morts",
  "spatial.layer.KILLS": "Vos éliminations",
  "spatial.layer.DEATHS.semantics":
    "Chaque point est VOTRE position au tick de votre mort. Ce n'est ni la position du tireur ni le chemin que vous avez suivi.",
  "spatial.layer.KILLS.semantics":
    "Chaque point est VOTRE position au tick où vous avez éliminé quelqu'un. Ce n'est pas la position de la victime.",
  "spatial.support.SUPPORTED": "Carte validée",
  "spatial.support.NOT_VALIDATED": "Carte pas encore validée",
  "spatial.support.UNKNOWN_MAP": "Carte non prise en charge",
  "spatial.unsupported.title": "Cette carte n'a pas encore de heatmap",
  "spatial.unsupported.NOT_VALIDATED":
    "La transformation de coordonnées de cette carte utilise les paramètres officiels du radar, mais n'a pas encore été comparée à des positions réelles d'une démo. Pour ne pas afficher une carte peut-être fausse, la heatmap reste désactivée jusqu'à cette validation.",
  "spatial.unsupported.UNKNOWN_MAP":
    "Nous n'avons pas les paramètres de radar de cette carte. Aucune position n'est dessinée.",
  "spatial.empty.title": "Pas encore de match",
  "spatial.empty.description":
    "Envoyez une démo pour voir où vous mourez et où vous éliminez sur chaque carte.",
  "spatial.status.NOT_OBSERVED":
    "Aucun événement de cette couche avec les filtres choisis. Ce n'est pas un zéro mesuré : il n'y a rien à dessiner.",
  "spatial.status.UNAVAILABLE":
    "Les événements existent, mais aucun n'a de position enregistrée. Les démos traitées avant le parser R5.8.24 n'ont pas de positions et ne sont pas retraitées.",
  "spatial.status.PARTIAL":
    "Couverture partielle : {measured} événements sur {eligible} ont une position dessinable. Les autres figurent sous « Hors de la carte » ci-dessous.",
  "spatial.status.OBSERVED": "Les {eligible} événements éligibles sont dessinés.",
  "spatial.legend.title": "Légende",
  "spatial.legend.cell":
    "Cellule de {px} px de radar (grille {grid} × {grid}). Couleur plus forte = plus d'événements.",
  "spatial.legend.max": "Maximum par cellule : {n}",
  "spatial.legend.events": "Événements dessinés",
  "spatial.legend.coverage": "Couverture",
  "spatial.legend.perRound": "Par round",
  "spatial.legend.perRoundValue": "{value} par round ({rounds} rounds)",
  "spatial.legend.perRoundInsufficient":
    "Échantillon insuffisant : au moins {min} événements dessinés ({n} actuellement).",
  "spatial.legend.perRoundUnavailable": "Pas de dénominateur de rounds pour ce filtre.",
  "spatial.legend.background":
    "Image officielle du radar de la carte (Valve, usage provisoire), alignée sur les coordonnées officielles du radar.",
  "spatial.legend.backgroundGrid":
    "Fond neutre en grille : les positions utilisent le système de coordonnées officiel du radar de la carte.",
  "spatial.legend.points": "Points = événements individuels ; cellules = nombre par zone.",
  "spatial.excluded.title": "Hors de la carte",
  "spatial.excluded.none": "Aucun événement éligible n'a été écarté.",
  "spatial.excluded.MISSING": "Aucune position enregistrée",
  "spatial.excluded.INVALID": "Position invalide",
  "spatial.excluded.SUSPECT_ORIGIN": "Position (0, 0, 0) écartée",
  "spatial.excluded.OUT_OF_BOUNDS": "Hors des limites du radar",
  "spatial.excluded.OTHER_LEVEL": "Sur l'autre niveau de la carte",
  "spatial.excluded.SIDE_UNKNOWN": "Camp inconnu dans ce round",
  "spatial.excluded.UNKNOWN_MAP": "Carte sans paramètres",
  "spatial.notMeasured.title": "Non mesuré dans cette version",
  "spatial.notMeasured.PRESENCE": "Présence et temps sur la carte",
  "spatial.notMeasured.ROUTES": "Routes et trajectoires",
  "spatial.notMeasured.EXPOSURE_TIME": "Temps d'exposition",
  "spatial.notMeasured.DAMAGE_DEALT": "Où vous avez infligé des dégâts",
  "spatial.notMeasured.DAMAGE_RECEIVED": "Où vous avez subi des dégâts",
  "spatial.notMeasured.UTILITY": "Grenades (lancer et détonation)",
  "spatial.notMeasured.note":
    "Les positions n'existent qu'au tick de chaque mort. Elles ne montrent ni vos déplacements ni le temps passé à chaque endroit.",
  "spatial.drill.title": "Événements de la cellule sélectionnée",
  "spatial.drill.hint":
    "Sélectionnez une cellule sur la carte ou dans la liste pour voir les rounds.",
  "spatial.drill.count": "{n} événement(s) dans cette cellule",
  "spatial.drill.match": "Match",
  "spatial.drill.round": "Round",
  "spatial.drill.tick": "Tick",
  "spatial.drill.side": "Votre camp",
  "spatial.drill.weapon": "Arme",
  "spatial.drill.headshot": "HS",
  "spatial.drill.yes": "oui",
  "spatial.drill.no": "non",
  "spatial.drill.truncated":
    "Liste limitée aux {n} premiers événements ; les comptages de la carte sont complets.",
  "spatial.cells.title": "Cellules avec le plus d'événements",
  "spatial.cells.cell": "Cellule (colonne {col}, ligne {row})",
  "spatial.cells.share": "{share} % des événements dessinés",
  "spatial.map.aria": "Heatmap de {layer} sur {map}",
  "spatial.map.cellAria": "Colonne {col}, ligne {row} : {n} événement(s)",
  "spatial.version": "Méthode {version} ; transformation {transform}.",
};

import type { nadePtBR } from "./pt-BR";

export const nadeFr: Record<keyof typeof nadePtBR, string> = {
  "nav.utility": "Utilitaires",
  "nade.eyebrow": "Grenades",
  "nade.title": "Vos utilitaires",
  "nade.description":
    "Grenades lancées, détonations, aveuglements causés, dégâts de HE et de feu, et à quel moment du round vous avez utilisé chacune — tout est mesuré à partir de la démo. Une grenade fait plus que ce que la démo enregistre : une flash qui n'a aveuglé aucun adversaire a pu forcer un repli.",
  "nade.empty.description": "Envoyez une démo pour voir vos utilitaires.",
  "nade.noParticipant.description":
    "Impossible de vous relier à un seul joueur de ce match ; aucune grenade ne vous est donc attribuée.",
  "nade.note.noThrower":
    "Ce match n'a pas enregistré qui lançait chaque grenade. Détonations et effet des flashs restent non observés.",
  "nade.note.noBlinds":
    "Cette démo n'enregistre pas qui chaque flash a aveuglé (les démos HLTV ne contiennent pas cet événement). Aveuglement, adversaires et coéquipiers aveuglés restent non observés — jamais zéro.",
  "nade.note.legacy":
    "Ce match a été traité avant que la démo n'enregistre chaque lancer et chaque départ de feu. Lancers et molotov/incendiaire restent non observés ; envoyez une nouvelle démo pour les mesurer.",
  "nade.section.grenades": "Grenades",
  "nade.section.grenades.subtitle":
    "Vos lancers (quand ils sont enregistrés) et détonations, par type et par moment du round.",
  "nade.col.grenade": "Grenade",
  "nade.col.throws": "Lancers",
  "nade.col.detonations": "Détonations",
  "nade.col.phase": "Moment",
  "nade.col.enemies": "Adversaires aveuglés",
  "nade.col.teammates": "Coéquipiers aveuglés",
  "nade.col.blindSeconds": "Aveuglement adverse",
  "nade.grenade.flash": "Flash",
  "nade.grenade.he": "HE",
  "nade.grenade.smoke": "Fumigène",
  "nade.grenade.fire": "Molotov / incendiaire",
  "nade.grenade.decoy": "Leurre",
  "nade.phase.before_first_kill": "Avant la 1re élimination",
  "nade.phase.after_first_kill": "Après la 1re élimination",
  "nade.phase.after_plant": "Après le plant",
  "nade.phaseNote":
    "Moment de la détonation : avant la première élimination du round (mise en place/entrée), après celle-ci et avant le plant, ou après le plant. Les leurres n'ont pas de détonation enregistrée.",
  "nade.section.flash": "Flashs",
  "nade.section.flash.subtitle":
    "Chaque joueur aveuglé est relié à votre flash par le tick même de la détonation, tel que le jeu l'enregistre.",
  "nade.section.damage": "Dégâts de HE et de feu",
  "nade.section.damage.subtitle":
    "Dégâts infligés par vos HE et votre feu, séparés entre adversaires et coéquipiers.",
  "nade.section.list": "Vos flashs",
  "nade.section.list.subtitle": "Ouvrez chaque flash dans le replay 2D, au tick de sa détonation.",
  "nade.list.notObserved":
    "La liste des flashs avec effet n'est pas disponible pour ce match : la démo n'a pas enregistré qui a été aveuglé.",
  "nade.list.none": "Aucune flash de votre part enregistrée dans ce match.",
  "nade.noEffect": "aucun effet mesuré",
  "nade.self": "vous",
  "nade.unit.flashes": "flashs",
  "nade.unit.grenades": "grenades",
  "nade.metric.flashes_detonated": "Flashs détonées",
  "nade.metric.flash_effective_rate": "Flashs ayant aveuglé un adversaire",
  "nade.metric.enemies_blinded_per_flash": "Adversaires aveuglés par flash",
  "nade.metric.enemy_blind_seconds_per_flash": "Aveuglement adverse par flash",
  "nade.metric.teammates_blinded": "Coéquipiers aveuglés",
  "nade.metric.self_blinded": "Flashs qui vous ont aveuglé",
  "nade.metric.flash_assist": "Assistances de flash",
  "nade.metric.he_damage_per_grenade": "Dégâts par HE",
  "nade.metric.fire_damage_per_grenade": "Dégâts par molotov/incendiaire",
  "nade.metric.team_damage": "Dégâts de grenade aux coéquipiers",
  "nade.metric.kills": "Éliminations à la HE ou au feu",
  "nade.methodText.flashes_detonated":
    "Nombre de vos flashs qui ont détoné (le jeu enregistre qui a lancé chacune).",
  "nade.methodText.flash_effective_rate":
    "Flashs ayant aveuglé au moins un adversaire ÷ vos flashs. Une flash sans adversaire aveuglé est « aucun effet mesuré » : le jeu n'a enregistré aucun aveuglement, mais elle a pu forcer un repli que la démo ne montre pas. Minimum : 5 flashs.",
  "nade.methodText.enemies_blinded_per_flash":
    "Adversaires aveuglés (événement du jeu au tick de la détonation) ÷ vos flashs. Minimum : 5 flashs.",
  "nade.methodText.enemy_blind_seconds_per_flash":
    "Somme des durées d'aveuglement des adversaires, telles que le jeu les enregistre, ÷ vos flashs. Minimum : 5 flashs.",
  "nade.methodText.teammates_blinded":
    "Coéquipiers aveuglés par vos flashs (même tick de détonation).",
  "nade.methodText.self_blinded": "Vos flashs qui vous ont aveuglé.",
  "nade.methodText.flash_assist":
    "Nombre déjà enregistré pour le match. Observé quand il vient du marqueur du jeu ; déduit quand il vient de l'attribution temporelle (élimination d'un coéquipier dans les 3 s suivant un adversaire que vous avez aveuglé).",
  "nade.methodText.he_damage_per_grenade":
    "Dégâts de vos HE aux adversaires ÷ vos HE détonées. Minimum : 5 grenades.",
  "nade.methodText.fire_damage_per_grenade":
    "Dégâts de votre feu aux adversaires ÷ vos molotovs/incendiaires. Minimum : 5 grenades.",
  "nade.methodText.team_damage": "Dégâts de vos HE et de votre feu aux coéquipiers.",
  "nade.methodText.kills": "Adversaires éliminés à la HE ou au feu.",
};

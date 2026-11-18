import type { adaptivePtBR } from "./pt-BR";

export const adaptiveFr: Record<keyof typeof adaptivePtBR, string> = {
  "training.adaptive.catalogHeading": "Cours recommandés du catalogue",
  "training.adaptive.noPromise":
    "Le plan organise votre entraînement à partir de vos données ; il ne garantit pas une amélioration. Faites des pauses et adaptez le volume à votre temps.",
  "training.adaptive.state.NO_EVIDENCE.title": "Pas encore de données pour un plan",
  "training.adaptive.state.NO_EVIDENCE.body":
    "Aucun domaine ne montre de point à travailler avec les données actuelles. Envoyez d'autres démos ; aucun exercice n'est recommandé sans preuve.",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.title": "Échantillon insuffisant pour un plan",
  "training.adaptive.state.INSUFFICIENT_SAMPLE.body":
    "{n} match(s) analysé(s) ; le plan personnalisé en demande au moins {min}.",
  "training.adaptive.history": "Plans précédents",
  "training.adaptive.history.subtitle": "Historique conservé ; aucun plan n'est supprimé.",
  "training.adaptive.history.item": "Plan de {h} jours commencé le {start}",
  "training.adaptive.score":
    "priorité {s} = confiance {c} × (0,6·écart {gap} + 0,25·tendance {trend}) + objectif {g}",
  "training.adaptive.why":
    "Pourquoi ce domaine : les preuves ci-dessous, avec échantillon et méthode.",
  "training.adaptive.evidence.dna": "Player DNA : indice {v}/100 (sous 60) sur {n} matchs.",
  "training.adaptive.evidence.trend":
    "{metric} : {v} (mesuré dans {n} matchs sur {w}) ; variation vs période précédente : {d}.",
  "training.adaptive.noComparison": "pas de comparaison valide",
  "training.adaptive.openEvidence": "voir la preuve",
  "training.adaptive.create.title": "Créer un plan d'entraînement",
  "training.adaptive.create.subtitle":
    "Priorités calculées à partir de vos matchs. Vous choisissez l'horizon et la disponibilité.",
  "training.adaptive.excluded": "Domaines écartés :",
  "training.adaptive.exclusion.NOT_MEASURED": "non mesuré",
  "training.adaptive.exclusion.NO_SIGNAL": "rien à travailler",
  "training.adaptive.exclusion.NO_EXERCISE": "aucun exercice disponible",
  "training.adaptive.exclusion.LOW_SAMPLE": "échantillon faible",
  "training.adaptive.horizon": "Horizon",
  "training.adaptive.horizonN": "{n} jours",
  "training.adaptive.sessionsPerWeek": "Séances par semaine",
  "training.adaptive.minutes": "Minutes par séance",
  "training.adaptive.dropAreas": "Exclure du plan :",
  "training.adaptive.create": "Créer le plan",
  "training.adaptive.method":
    "Méthode cs2.training-priority.v1 : seulement les domaines avec preuve (DNA observé sous 60 ou baisse dans une comparaison valide), échantillon minimum de 3 matchs et exercice disponible. 7 jours = 1 priorité, 30 = 2, 90 = 3.",
  "training.adaptive.result.OPEN_PLAN_EXISTS": "Un plan est déjà ouvert.",
  "training.adaptive.result.NO_EVIDENCE": "Pas assez de preuves pour le plan.",
  "training.adaptive.result.INSUFFICIENT_SAMPLE": "Échantillon insuffisant.",
  "training.adaptive.result.NOT_FOUND": "Plan introuvable.",
  "training.adaptive.result.STALE": "Le plan a changé depuis l'ouverture de la page ; rechargez.",
  "training.adaptive.result.CLOSED": "Ce plan est clôturé.",
  "training.adaptive.plan.title": "Plan de {n} jours",
  "training.adaptive.plan.subtitle": "{start} – {end} · version {v}",
  "training.adaptive.status.ACTIVE": "actif",
  "training.adaptive.status.PAUSED": "en pause",
  "training.adaptive.status.COMPLETED": "terminé",
  "training.adaptive.status.CANCELLED": "annulé",
  "training.adaptive.adherence": "Assiduité : {done} séances sur {due} prévues ({p} %)",
  "training.adaptive.adherence.none": "Assiduité : aucune séance prévue pour l'instant",
  "training.adaptive.nextReview": "Prochaine revue : {d}",
  "training.adaptive.pause": "Mettre en pause",
  "training.adaptive.resume": "Reprendre",
  "training.adaptive.review": "Revoir le plan",
  "training.adaptive.complete": "Terminer",
  "training.adaptive.cancel": "Annuler le plan",
  "training.adaptive.diff.title": "Révision proposée",
  "training.adaptive.diff.explain":
    "Calculée à partir de vos matchs actuels. Rien ne change avant votre accord ; les séances faites et passées restent telles quelles.",
  "training.adaptive.diff.accept": "Accepter la nouvelle version",
  "training.adaptive.diff.keep": "Garder le plan actuel",
  "training.adaptive.diff.none": "aucun changement",
  "training.adaptive.diff.reordered": "ordre des priorités modifié",
  "training.adaptive.diff.evidence": "preuves mises à jour",
  "training.adaptive.priorities": "Priorités et preuves",
  "training.adaptive.priorities.subtitle":
    "Chaque priorité montre sa preuve et le calcul qui l'a classée.",
  "training.adaptive.goals": "Objectifs",
  "training.adaptive.goals.subtitle":
    "Objectifs de processus et métriques suivies avec leur base ; aucun chiffre n'est promis.",
  "training.adaptive.goal.PROCESS_SESSIONS": "Terminer au moins {n} séances du plan.",
  "training.adaptive.goal.PROCESS_REVIEW_MOMENTS":
    "Enregistrer et revoir au moins {n} moments dans la bibliothèque.",
  "training.adaptive.goal.TRACK_METRIC":
    "Suivre {metric} : base {v} ({n} matchs). Comparée à la revue, sans cible chiffrée.",
  "training.adaptive.sessions": "Séances",
  "training.adaptive.sessions.subtitle":
    "Marquez chaque séance terminée ou sautée ; ouvrir la page ne compte pas.",
  "training.adaptive.week": "Semaine {n}",
  "training.adaptive.versions": "Versions du plan",
  "training.adaptive.versions.subtitle":
    "Chaque changement crée une version ; les précédentes sont conservées.",
  "training.adaptive.versionItem": "Version {v} · {d}",
  "training.adaptive.reason.CREATED": "création",
  "training.adaptive.reason.REVISION": "révision acceptée",
  "training.adaptive.reason.USER_EDIT": "modification du joueur",
  "training.adaptive.session.PLANNED": "prévue",
  "training.adaptive.session.DONE": "faite",
  "training.adaptive.session.SKIPPED": "sautée",
  "training.adaptive.session.SUPERSEDED": "remplacée",
  "training.adaptive.exerciseUnavailable": "Exercice indisponible",
  "training.adaptive.minutesN": "{n} min",
  "training.adaptive.howTo": "Comment faire",
  "training.adaptive.commands": "Commandes console (serveur d'entraînement hors ligne)",
  "training.adaptive.done": "Terminé quand :",
  "training.adaptive.tracks": "Métrique relue à la revue : {m}",
  "training.adaptive.openPage": "Ouvrir dans CS2 PRO",
  "training.adaptive.openMoments": "Ouvrir mes moments enregistrés",
  "training.adaptive.reference": "Référence externe",
  "training.adaptive.referenceNote": "Contenu tiers ; la disponibilité peut changer.",
  "training.adaptive.durationDone": "Durée (min)",
  "training.adaptive.markDone": "Fait",
  "training.adaptive.markSkipped": "Sautée",
  "training.adaptive.undo": "Annuler",
  "training.area.aim": "Visée",
  "training.area.dueling": "Duels",
  "training.area.positioning": "Positionnement",
  "training.area.survivability": "Survie",
  "training.area.utility": "Utilitaires",
  "training.area.teamplay": "Jeu d'équipe (échanges)",
  "training.area.clutch": "Clutch",
  "training.area.decision_making": "Décisions",
  "training.area.economy": "Économie",
  "training.area.consistency": "Régularité",
  "training.track.hsPercent": "Headshot %",
  "training.track.openingWinRate": "ouvertures gagnées",
  "training.track.deathsPerRound": "morts par round",
  "training.track.tradeKillsPerRound": "éliminations d'échange par round",
  "training.track.flashAssistsPerRound": "flash assists par round",
  "training.track.clutchWinRate": "clutches gagnés",
  "training.track.moments.saved": "moments enregistrés pour revue",
  "training.track.sessions.done": "séances faites",
  "exercise.first_bullet_headshots.name": "Première balle à la tête (Aim Botz)",
  "exercise.first_bullet_headshots.goal":
    "Travailler une première balle précise, à l'arrêt, sans spray.",
  "exercise.first_bullet_headshots.step1":
    "Ouvrez la carte Aim Botz du Steam Workshop dans CS2 (Jouer → Cartes du Workshop).",
  "exercise.first_bullet_headshots.step2":
    "À l'AK-47 ou M4, visez la tête et tirez une balle à la fois à l'arrêt ; laissez le viseur se stabiliser.",
  "exercise.first_bullet_headshots.step3":
    "Faites 3 séries de 100 éliminations avec 1 minute de repos entre les séries.",
  "exercise.first_bullet_headshots.criteria": "3 séries de 100 éliminations, une balle à la fois.",
  "exercise.spray_wall.name": "Contrôle du spray sur un mur",
  "exercise.spray_wall.goal": "Répéter le recul de votre fusil principal.",
  "exercise.spray_wall.step1":
    "Lancez un serveur local (Jouer → Entraînement, sans bots) et collez les commandes dans la console.",
  "exercise.spray_wall.step2":
    "À environ 15 m d'un mur, videz un chargeur en compensant le recul ; les impacts sont marqués.",
  "exercise.spray_wall.step3":
    "Répétez 10 chargeurs à l'AK-47 et 10 à la M4 en comparant la dispersion.",
  "exercise.spray_wall.criteria":
    "20 chargeurs, avec des impacts de plus en plus groupés selon votre jugement.",
  "exercise.crosshair_placement_walk.name": "Parcours de placement du viseur",
  "exercise.crosshair_placement_walk.goal":
    "Garder le viseur à hauteur de tête sur les angles où un ennemi peut apparaître.",
  "exercise.crosshair_placement_walk.step1":
    "Sur un serveur local sans bots, parcourez les routes de la carte que vous jouez le plus.",
  "exercise.crosshair_placement_walk.step2":
    "Marchez lentement, viseur à hauteur de tête, contre le bord de chaque angle avant de passer.",
  "exercise.crosshair_placement_walk.step3":
    "Faites les routes des deux côtés (T et CT) ; répétez 3 fois.",
  "exercise.crosshair_placement_walk.criteria":
    "Trois parcours complets sans viser le sol ni des murs sans angle.",
  "exercise.counter_strafe.name": "Contre-strafe",
  "exercise.counter_strafe.goal":
    "Arrêter le mouvement avant de tirer pour que la première balle soit précise.",
  "exercise.counter_strafe.step1":
    "Sur un serveur local avec les commandes, placez-vous face à un mur.",
  "exercise.counter_strafe.step2":
    "Déplacez-vous d'un côté (A ou D), appuyez sur la touche opposée pour vous arrêter et tirez une fois ; les impacts montrent si vous étiez arrêté.",
  "exercise.counter_strafe.step3": "Faites 3 séries de 50 répétitions en alternant les côtés.",
  "exercise.counter_strafe.criteria":
    "150 répétitions avec des impacts groupés (sans dispersion de tir en mouvement).",
  "exercise.prefire_angles.name": "Pré-visée des angles courants",
  "exercise.prefire_angles.goal": "Arriver aux angles avec le viseur déjà placé et éliminer vite.",
  "exercise.prefire_angles.step1":
    "Sur un serveur local avec les commandes, utilisez bot_place pour placer des bots immobiles sur les angles courants d'un site.",
  "exercise.prefire_angles.step2":
    "Sortez du spawn et entrez sur le site en nettoyant les angles dans l'ordre, en visant déjà chaque bot.",
  "exercise.prefire_angles.step3":
    "Répétez l'entrée 10 fois par site en changeant l'ordre des angles.",
  "exercise.prefire_angles.step4":
    "Faites 4 séries ; notez votre temps pour chaque nettoyage (les bots ne tirent pas avec bot_stop 1).",
  "exercise.prefire_angles.criteria": "20 entrées complètes avec le temps de chacune noté.",
  "exercise.death_review.name": "Revue des morts",
  "exercise.death_review.goal": "Comprendre où et pourquoi vous mourez le plus souvent.",
  "exercise.death_review.step1": "Ouvrez Morts dans CS2 PRO et choisissez un match récent.",
  "exercise.death_review.step2":
    "Revoyez 5 morts : regardez le contexte, ouvrez le replay à l'instant et décidez s'il s'agit d'information, de positionnement ou de visée.",
  "exercise.death_review.step3":
    "Enregistrez comme moment les morts à revoir, avec une note sur ce que vous feriez autrement.",
  "exercise.death_review.criteria": "5 morts revues avec au moins 3 moments enregistrés avec note.",
  "exercise.first_death_replay.name": "Replay des morts d'ouverture",
  "exercise.first_death_replay.goal": "Revoir les rounds où vous êtes mort en premier.",
  "exercise.first_death_replay.step1":
    "Ouvrez Rounds dans CS2 PRO et trouvez les rounds marqués « mort en premier ».",
  "exercise.first_death_replay.step2":
    "Ouvrez le replay 2D quelques secondes avant et regardez d'où venait l'adversaire et où étaient vos coéquipiers.",
  "exercise.first_death_replay.step3":
    "Écrivez une note sur ce que vous changeriez (position, timing ou utilitaire) et enregistrez le moment.",
  "exercise.first_death_replay.criteria":
    "Tous les rounds d'ouverture d'un match revus, avec note.",
  "exercise.trade_spacing_review.name": "Revue des échanges et de l'espacement",
  "exercise.trade_spacing_review.goal":
    "Rester à une distance où un coéquipier peut échanger votre mort (et vous la sienne).",
  "exercise.trade_spacing_review.step1":
    "Dans Rounds, regardez vos morts non échangées et les échanges de vos coéquipiers.",
  "exercise.trade_spacing_review.step2":
    "Dans le replay, observez la distance et la ligne de vue entre vous et le coéquipier le plus proche au moment de la mort.",
  "exercise.trade_spacing_review.step3":
    "Enregistrez 3 moments de morts non échangées avec une note sur où vous placer.",
  "exercise.trade_spacing_review.criteria":
    "3 moments enregistrés avec une note sur le placement pour échanger.",
  "exercise.utility_lineups.name": "Lineups d'utilitaires",
  "exercise.utility_lineups.goal":
    "Apprendre des lancers fixes de smoke et de flash pour votre carte.",
  "exercise.utility_lineups.step1":
    "Sur un serveur local avec les commandes, choisissez 2 smokes et 2 flashs utiles de votre carte principale.",
  "exercise.utility_lineups.step2":
    "Utilisez l'aperçu de trajectoire pour réussir chaque lancer et notez les repères de visée et de position.",
  "exercise.utility_lineups.step3":
    "Utilisez sv_rethrow_last_grenade pour répéter et vérifier ; répétez chaque lancer 10 fois.",
  "exercise.utility_lineups.step4":
    "Testez chaque lancer dans un match contre des bots, depuis le spawn.",
  "exercise.utility_lineups.criteria": "4 lancers réussis 10 fois de suite chacun.",
  "exercise.utility_review.name": "Revue des utilitaires",
  "exercise.utility_review.goal":
    "Voir si vos grenades ont aveuglé, infligé des dégâts ou été gaspillées.",
  "exercise.utility_review.step1": "Ouvrez Utilitaires dans CS2 PRO sur un match récent.",
  "exercise.utility_review.step2":
    "Regardez les flashs qui ont aveuglé des coéquipiers ou personne et les grenades sans dégâts ; ouvrez le replay de 3 d'entre elles.",
  "exercise.utility_review.step3": "Enregistrez 2 lancers à corriger comme moments, avec une note.",
  "exercise.utility_review.criteria": "3 lancers revus et 2 moments enregistrés avec note.",
  "exercise.clutch_review.name": "Revue des clutches",
  "exercise.clutch_review.goal":
    "Revoir vos décisions quand vous étiez seul contre des adversaires.",
  "exercise.clutch_review.step1":
    "Dans Rounds, ouvrez les rounds de clutch (1vN) de vos derniers matchs.",
  "exercise.clutch_review.step2":
    "Dans le replay, notez le temps restant, la situation de la bombe et où vous avez choisi de jouer.",
  "exercise.clutch_review.step3":
    "Écrivez une alternative comme hypothèse (pas comme certitude) et enregistrez le moment.",
  "exercise.clutch_review.criteria": "Tous les clutches de 2 matchs revus avec note.",
  "exercise.economy_review.name": "Revue de l'économie",
  "exercise.economy_review.goal": "Comprendre les achats de l'équipe et les vôtres à chaque round.",
  "exercise.economy_review.step1":
    "Dans Rounds, sur un match avec achats mesurés, regardez l'achat de l'équipe et le vôtre par round.",
  "exercise.economy_review.step2":
    "Repérez les rounds où votre achat différait de celui de l'équipe (achat mixte) et le résultat.",
  "exercise.economy_review.step3":
    "Enregistrez 2 moments de décisions d'achat à discuter avec l'équipe.",
  "exercise.economy_review.criteria":
    "1 match revu et 2 moments enregistrés (seulement sur les matchs avec dépense enregistrée).",
  "exercise.warmup_routine.name": "Routine d'échauffement",
  "exercise.warmup_routine.goal": "Commencer chaque session de jeu par la même routine courte.",
  "exercise.warmup_routine.step1": "5 minutes sur Aim Botz (première balle à la tête).",
  "exercise.warmup_routine.step2":
    "10 minutes de Deathmatch axé sur le placement du viseur et le contre-strafe.",
  "exercise.warmup_routine.step3": "Notez votre ressenti avant le premier match de la journée.",
  "exercise.warmup_routine.criteria": "Routine faite avant de jouer, les jours prévus.",
};

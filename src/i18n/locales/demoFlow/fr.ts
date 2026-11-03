import type { demoFlowPtBR } from "./pt-BR";

export const demoFlowFr: Record<keyof typeof demoFlowPtBR, string> = {
  "demoFlow.dialogLabel": "Analyse de votre démo",
  "demoFlow.file": "Fichier",
  "demoFlow.size": "Taille",
  "demoFlow.steps.label": "Étapes de l’analyse",
  "demoFlow.step.upload": "Envoi",
  "demoFlow.step.validate": "Validation",
  "demoFlow.step.read": "Lecture du match",
  "demoFlow.step.metrics": "Statistiques",
  "demoFlow.step.identify": "Identification",
  "demoFlow.step.done": "Finalisation",
  "demoFlow.state.done": "terminée",
  "demoFlow.state.active": "en cours",
  "demoFlow.state.pending": "en attente",
  "demoFlow.state.error": "en erreur",

  "demoFlow.upload.title": "Envoi de votre démo",
  "demoFlow.upload.body": "Nous envoyons votre match en toute sécurité pour lancer l’analyse.",
  "demoFlow.upload.hashing": "Préparation du fichier (vérification du contenu)…",
  "demoFlow.upload.registering": "Enregistrement de l’envoi…",
  "demoFlow.upload.uploading": "Envoi du fichier…",
  "demoFlow.upload.keepOpen":
    "Gardez cette page ouverte jusqu’à la fin de l’envoi. Ensuite, l’analyse continue sur le serveur.",
  "demoFlow.upload.failedTitle": "Impossible d’envoyer la démo",
  "demoFlow.upload.tryAgain": "Choisir à nouveau le fichier",
  "demoFlow.upload.interruptedTitle": "L’envoi a été interrompu",
  "demoFlow.upload.interruptedBody":
    "La page a été fermée ou rechargée pendant l’envoi de {file}, et le navigateur ne conserve pas le fichier. Aucune analyse n’a été lancée pour cet envoi. Choisissez à nouveau le même fichier pour l’envoyer.",

  "demoFlow.validate.title": "Validation de votre démo",
  "demoFlow.validate.body":
    "Nous vérifions le fichier et préparons votre match pour le traitement.",
  "demoFlow.validate.waitingJob": "Confirmation de la réception de la démo…",
  "demoFlow.validate.queued": "Votre démo est dans la file de traitement.",
  "demoFlow.validate.validating": "Validation du fichier de la démo.",

  "demoFlow.read.title": "Lecture de votre match",
  "demoFlow.read.body":
    "Nous analysons les rounds, les joueurs, les événements et les informations du match.",

  "demoFlow.metrics.title": "Calcul de vos statistiques",
  "demoFlow.metrics.body":
    "Nous organisons les données du match et préparons votre profil de performance.",
  "demoFlow.attaching.title": "Association du match à votre joueur",
  "demoFlow.attaching.body":
    "Votre joueur est confirmé. Nous relions ce match et ses statistiques à votre profil.",

  "demoFlow.identify.title": "Identification de votre joueur",
  "demoFlow.identify.body": "Nous identifions votre profil dans ce match.",
  "demoFlow.identify.loadError": "Impossible de charger les joueurs de ce match.",
  "demoFlow.identify.reload": "Réessayer le chargement",
  "demoFlow.identify.automaticTitle": "Nous vous avons trouvé dans ce match",
  "demoFlow.identify.automaticBody":
    "Nous avons identifié votre joueur grâce au compte Steam lié. Confirmez pour terminer l’analyse.",
  "demoFlow.identify.confirmAutomatic": "Oui, c’est moi",
  "demoFlow.select.title": "Quel est votre pseudo dans ce match ?",
  "demoFlow.select.body":
    "Nous avons trouvé plusieurs joueurs ou n’avons pas pu confirmer automatiquement lequel est vous. Sélectionnez votre pseudo pour associer correctement vos statistiques à votre profil.",
  "demoFlow.select.cta": "Confirmer mon joueur",
  "demoFlow.select.required": "Sélectionnez un joueur pour continuer.",
  "demoFlow.select.suggested": "Pseudo de votre historique",
  "demoFlow.select.team": "Équipe",
  "demoFlow.select.later": "Décider plus tard (disponible dans l’historique)",

  "demoFlow.done.title": "Analyse terminée !",
  "demoFlow.done.body": "Votre match a été traité et vos données sont prêtes.",
  "demoFlow.done.player": "Joueur",
  "demoFlow.done.map": "Carte",
  "demoFlow.done.status": "Statut",
  "demoFlow.done.statusValue": "Traité et associé à votre profil",
  "demoFlow.done.cta": "Voir mon analyse",
  "demoFlow.done.close": "Fermer",
  "demoFlow.done.autoClose": "Cette fenêtre se ferme toute seule dans {seconds} s.",

  "demoFlow.failed.title": "L’analyse n’a pas abouti",
  "demoFlow.failed.retryHint":
    "Vous pouvez réessayer depuis la carte de cette démo dans l’historique, selon les règles de nouvelle tentative.",
  "demoFlow.failed.selectAndRetry":
    "Le match a été lu, mais l’étape finale a échoué. Sélectionnez votre joueur pour lancer une nouvelle tentative.",
  "demoFlow.cardAction.title": "Cette démo nécessite une action dans l’historique",
  "demoFlow.cardAction.reprocess":
    "Elle a été analysée par une version antérieure du parser. Utilisez le bouton de la carte pour la retraiter avec le parser actuel.",
  "demoFlow.cardAction.reupload":
    "Le fichier de cette démo a expiré. Envoyez à nouveau le fichier pour l’analyser.",
  "demoFlow.blocked.title": "Vérification nécessaire",
  "demoFlow.cancelRequested.title": "Annulation de l’analyse",
  "demoFlow.cancelled.title": "Analyse annulée",
  "demoFlow.unknown.title": "État inconnu",
  "demoFlow.unknown.body":
    "Nous avons reçu un état que nous ne reconnaissons pas. Rien n’a été considéré comme terminé ; suivez cette démo dans l’historique.",

  "demoFlow.cancel": "Annuler l’analyse",
  "demoFlow.cancelConfirm": "Confirmer l’annulation",
  "demoFlow.cancelKeep": "Poursuivre l’analyse",
  "demoFlow.cancelQuestion":
    "Annuler arrête l’analyse de cette démo. L’historique est conservé. Voulez-vous annuler ?",
  "demoFlow.cancelError": "Impossible d’annuler pour le moment. L’analyse continue.",
  "demoFlow.background": "Continuer en arrière-plan",
  "demoFlow.backgroundHint":
    "L’analyse continue sur le serveur ; suivez-la sur la carte dans l’historique.",
  "demoFlow.close": "Fermer",
  "demoFlow.reconnecting": "Pas de connexion. Tentative de reconnexion et de reprise du suivi…",
  "demoFlow.resumed": "Nous avons repris le suivi de cette démo.",
  "demoFlow.leaveWarning":
    "L’envoi de la démo est toujours en cours. Quitter maintenant interrompt l’envoi.",
};

import type { guidancePtBR } from "./pt-BR";

export const guidanceFr: Record<keyof typeof guidancePtBR, string> = {
  "guidance.whatToDo": "Que devez-vous faire ?",
  "guidance.reference": "Référence technique",
  "guidance.action.retry": "Réessayer",
  "guidance.action.chooseAnother": "Envoyer une autre démo",
  "guidance.action.selectPlayer": "Sélectionner mon joueur",
  "guidance.action.report": "Signaler un problème",
  "guidance.action.understood": "Compris",

  "guidance.processing.title": "Analyse en cours",
  "guidance.processing.body": "Votre démo est dans la file ou en cours de traitement normal.",
  "guidance.processing.todo":
    "Inutile de l’envoyer à nouveau. Suivez le statut ici ; l’analyse continue sur le serveur.",
  "guidance.completed.title": "Analyse terminée",
  "guidance.completed.body": "Votre match a été traité et associé à votre profil.",
  "guidance.completed.todo": "Rien à faire. Vos données apparaissent déjà dans vos analyses.",
  "guidance.partial.title": "Analyse terminée avec des limites",
  "guidance.partial.body":
    "Votre match a été traité, mais certaines données n’étaient pas disponibles dans cette démo. Nous n’affichons que ce qui a réellement été mesuré.",
  "guidance.partial.todo":
    "Rien à faire. Les statistiques indisponibles restent vides, jamais à zéro.",
  "guidance.identity_pending.title": "En attente d’identification",
  "guidance.identity_pending.body":
    "Votre match a été lu. Nous devons confirmer quel joueur est vous avant de finaliser vos statistiques.",
  "guidance.identity_pending.todo": "Sélectionnez votre pseudo pour poursuivre l’analyse.",
  "guidance.invalid_file.title": "Impossible de lire votre démo",
  "guidance.invalid_file.body":
    "Nous n’avons pas pu lire cette démo. Le fichier est peut-être incomplet ou endommagé.",
  "guidance.invalid_file.todo": "Choisissez une autre démo et réessayez.",
  "guidance.incompatible_format.title": "Format incompatible",
  "guidance.incompatible_format.body":
    "Ce fichier n’a pas un format ou une taille compatible avec CS2 PRO.",
  "guidance.incompatible_format.todo": "Sélectionnez une démo CS2 valide au format .dem.",
  "guidance.insufficient_sample.title": "Match trop court",
  "guidance.insufficient_sample.body":
    "La démo est valide, mais elle contient trop peu de rounds exploitables pour une analyse honnête.",
  "guidance.insufficient_sample.todo":
    "Envoyez une autre démo d’un match plus long. Renvoyer cette même démo donnera le même résultat.",
  "guidance.temporary_failure.title": "Une défaillance temporaire est survenue",
  "guidance.temporary_failure.body":
    "Notre système a rencontré une défaillance temporaire pendant l’analyse. Votre démo reste enregistrée dans l’historique.",
  "guidance.temporary_failure.todo":
    "Inutile de renvoyer la démo. Réessayez ; si le problème persiste, signalez-le à notre équipe.",
  "guidance.service_issue.title": "Une défaillance de notre côté",
  "guidance.service_issue.body":
    "L’analyse s’est arrêtée à cause d’un problème dans notre service d’analyse, pas dans votre fichier.",
  "guidance.service_issue.todo":
    "Ne renvoyez pas cette même démo pour l’instant. Signalez le problème pour que notre équipe enquête.",
  "guidance.raw_audit_review.title": "Analyse retenue pour vérification",
  "guidance.raw_audit_review.body":
    "Nous avons reçu votre démo, mais certaines données n’ont pas passé les contrôles de sécurité et d’intégrité. Par sécurité, nous n’avons pas généré les statistiques de ce match.",
  "guidance.raw_audit_review.todo":
    "Inutile de renvoyer cette même démo. Notre équipe doit examiner le problème.",
  "guidance.canonical_review.title": "Validation des données non terminée",
  "guidance.canonical_review.body":
    "Nous n’avons pas pu valider les données nécessaires aux statistiques de ce match. Vos données brutes ont été conservées.",
  "guidance.canonical_review.todo":
    "Notre équipe doit vérifier la cause avant que l’analyse puisse se terminer. Ne renvoyez pas cette même démo.",
  "guidance.quarantined.title": "Match en vérification",
  "guidance.quarantined.body":
    "Ce match est retenu en vérification technique et ne peut pas être retraité pour l’instant.",
  "guidance.quarantined.todo":
    "Ne renvoyez pas cette même démo. Signalez-le si vous avez besoin d’aide.",
  "guidance.older_parser.title": "Analysée par une version antérieure",
  "guidance.older_parser.body":
    "Cette démo a été analysée par une version antérieure de notre analyseur.",
  "guidance.older_parser.todo":
    "Utilisez « Retraiter avec le parser actuel » sur la carte de cette démo. Inutile de renvoyer le fichier.",
  "guidance.file_expired.title": "Le fichier de cette démo a expiré",
  "guidance.file_expired.body": "Le fichier enregistré de cette démo n’est plus disponible.",
  "guidance.file_expired.todo": "Envoyez à nouveau le fichier pour l’analyser.",
  "guidance.cancelled.title": "Analyse annulée",
  "guidance.cancelled.body": "L’analyse de cette démo a été annulée. L’historique a été conservé.",
  "guidance.cancelled.todo": "Pour l’analyser, envoyez à nouveau la démo.",
  "guidance.internal_error.title": "Un problème inattendu est survenu",
  "guidance.internal_error.body": "Un problème inattendu est survenu pendant l’analyse.",
  "guidance.internal_error.todo":
    "Notre équipe peut enquêter. Envoyez un rapport pour nous aider à en trouver la cause.",
  "guidance.unknown.title": "État inconnu",
  "guidance.unknown.body":
    "Nous avons reçu un état que nous ne reconnaissons pas. Rien n’a été considéré comme terminé.",
  "guidance.unknown.todo": "Suivez cette démo dans l’historique ou signalez le problème.",
};

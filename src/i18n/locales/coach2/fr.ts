import type { coach2PtBR } from "./pt-BR";

export const coach2Fr: Record<keyof typeof coach2PtBR, string> = {
  "coach2.conversations": "Conversations",
  "coach2.conversationsEmpty": "Aucune conversation enregistrée pour l’instant.",
  "coach2.untitled": "Conversation sans titre",
  "coach2.delete": "Supprimer la conversation",
  "coach2.deleteConfirm": "Confirmer : supprimer",
  "coach2.deleteCancel": "Annuler",
  "coach2.deleteError": "La conversation n’a pas pu être supprimée. Réessayez.",
  "coach2.loadError": "Impossible de charger cette conversation.",
  "coach2.personalize": "Personnaliser",
  "coach2.prefs.title": "Personnalisez votre Coach (facultatif)",
  "coach2.prefs.description":
    "Dites au Coach sur quoi vous voulez vous concentrer. C’est ce que vous déclarez, pas une mesure : modifiable ou supprimable à tout moment.",
  "coach2.prefs.difficulty": "Principale difficulté",
  "coach2.prefs.difficultyNone": "Non précisé",
  "coach2.prefs.diff.AIM": "Visée",
  "coach2.prefs.diff.POSITIONING": "Placement",
  "coach2.prefs.diff.UTILITY": "Grenades et utilitaires",
  "coach2.prefs.diff.ECONOMY": "Économie",
  "coach2.prefs.diff.DECISIONS": "Prise de décision",
  "coach2.prefs.diff.TEAMPLAY": "Jeu d’équipe et communication",
  "coach2.prefs.diff.CONSISTENCY": "Régularité",
  "coach2.prefs.diff.MINDSET": "Mental",
  "coach2.prefs.maps": "Cartes qui vous intéressent",
  "coach2.prefs.profileNote":
    "L’objectif, le niveau et le rôle sont dans votre profil, et le Coach les utilise aussi.",
  "coach2.prefs.openProfile": "Modifier dans le profil",
  "coach2.prefs.save": "Enregistrer",
  "coach2.prefs.saved": "Préférences enregistrées.",
  "coach2.prefs.remove": "Supprimer les préférences",
  "coach2.prefs.removed": "Préférences supprimées.",
  "coach2.prefs.close": "Fermer",
  "coach2.prefs.error": "Enregistrement impossible. Réessayez.",
  "coach2.onboarding.hint":
    "Facultatif : indiquez au Coach votre principale difficulté et vos cartes pour des réponses plus ciblées.",
  "coach2.onboarding.dismiss": "Plus tard",
  "coach2.suggestions": "Questions suggérées",
  "coach2.suggestion.1": "Sur quoi dois-je concentrer mon entraînement cette semaine ?",
  "coach2.suggestion.2": "Que montrent mes chiffres sur mes derniers matchs ?",
  "coach2.suggestion.3": "Comment mieux utiliser mes grenades ?",
  "coach2.suggestion.4": "Est-ce que je meurs trop tôt dans les rounds ?",
  "coach2.error.timeout": "Le Coach a mis trop de temps à répondre. Réessayez dans un instant.",
  "coach2.error.providerConfig":
    "Le Coach est indisponible pour le moment à cause d’un problème de configuration. Il a été enregistré.",
  "coach2.error.noCredits": "Le Coach est temporairement indisponible. Réessayez plus tard.",
  "coach2.error.modelUnavailable":
    "Le modèle du Coach est indisponible pour le moment. Réessayez plus tard.",
  "coach2.error.inProgress":
    "Cette question est encore en cours de réponse. Attendez quelques secondes puis réessayez.",
  "coach2.error.persist": "La réponse a été générée mais n’a pas pu être enregistrée. Réessayez.",
  "coach2.error.outcomeUnknown":
    "Nous n'avons pas pu confirmer si le Coach a répondu. Pour éviter une double facturation, nous ne réessayons pas automatiquement : renvoyez la question quand vous voulez.",
  "coach2.error.invalidResponse": "Le Coach a renvoyé une réponse invalide. Réessayez.",
};

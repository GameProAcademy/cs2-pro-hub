import type { coach2PtBR } from "./pt-BR";

export const coach2Es: Record<keyof typeof coach2PtBR, string> = {
  "coach2.conversations": "Conversaciones",
  "coach2.conversationsEmpty": "Todavía no hay conversaciones guardadas.",
  "coach2.untitled": "Conversación sin título",
  "coach2.delete": "Eliminar conversación",
  "coach2.deleteConfirm": "Confirmar: eliminar",
  "coach2.deleteCancel": "Cancelar",
  "coach2.deleteError": "No se pudo eliminar la conversación. Inténtalo de nuevo.",
  "coach2.loadError": "No se pudo cargar esta conversación.",
  "coach2.personalize": "Personalizar",
  "coach2.prefs.title": "Personaliza tu Coach (opcional)",
  "coach2.prefs.description":
    "Dile al Coach en qué quieres centrarte. Es lo que declaras, no una medición: puedes cambiarlo o borrarlo cuando quieras.",
  "coach2.prefs.difficulty": "Principal dificultad",
  "coach2.prefs.difficultyNone": "No indicar",
  "coach2.prefs.diff.AIM": "Puntería",
  "coach2.prefs.diff.POSITIONING": "Posicionamiento",
  "coach2.prefs.diff.UTILITY": "Granadas y utilidades",
  "coach2.prefs.diff.ECONOMY": "Economía",
  "coach2.prefs.diff.DECISIONS": "Toma de decisiones",
  "coach2.prefs.diff.TEAMPLAY": "Juego en equipo y comunicación",
  "coach2.prefs.diff.CONSISTENCY": "Consistencia",
  "coach2.prefs.diff.MINDSET": "Mentalidad",
  "coach2.prefs.maps": "Mapas de interés",
  "coach2.prefs.profileNote":
    "Objetivo, nivel y rol están en tu perfil, y el Coach también los usa.",
  "coach2.prefs.openProfile": "Editar en el perfil",
  "coach2.prefs.save": "Guardar",
  "coach2.prefs.saved": "Preferencias guardadas.",
  "coach2.prefs.remove": "Eliminar preferencias",
  "coach2.prefs.removed": "Preferencias eliminadas.",
  "coach2.prefs.close": "Cerrar",
  "coach2.prefs.error": "No se pudo guardar. Inténtalo de nuevo.",
  "coach2.onboarding.hint":
    "Opcional: dile al Coach tu principal dificultad y tus mapas para obtener respuestas más enfocadas.",
  "coach2.onboarding.dismiss": "Ahora no",
  "coach2.suggestions": "Preguntas sugeridas",
  "coach2.suggestion.1": "¿Cuál debería ser mi foco de entrenamiento esta semana?",
  "coach2.suggestion.2": "¿Qué muestran mis números en mis últimas partidas?",
  "coach2.suggestion.3": "¿Cómo puedo usar mejor las granadas?",
  "coach2.suggestion.4": "¿Estoy muriendo demasiado pronto en las rondas?",
  "coach2.error.timeout":
    "El Coach tardó demasiado en responder. Inténtalo de nuevo en un momento.",
  "coach2.error.providerConfig":
    "El Coach no está disponible ahora por un problema de configuración. Ya se ha registrado.",
  "coach2.error.noCredits": "El Coach no está disponible temporalmente. Inténtalo más tarde.",
  "coach2.error.modelUnavailable":
    "El modelo del Coach no está disponible ahora. Inténtalo más tarde.",
  "coach2.error.inProgress":
    "Esta pregunta todavía se está respondiendo. Espera unos segundos e inténtalo de nuevo.",
  "coach2.error.persist": "La respuesta se generó, pero no se pudo guardar. Inténtalo de nuevo.",
  "coach2.error.outcomeUnknown":
    "No pudimos confirmar si el Coach llegó a responder. Para evitar un cobro doble no reintentamos automáticamente: envía la pregunta de nuevo cuando quieras.",
  "coach2.error.invalidResponse": "El Coach devolvió una respuesta no válida. Inténtalo de nuevo.",
};

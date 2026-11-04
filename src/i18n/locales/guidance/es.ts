import type { guidancePtBR } from "./pt-BR";

export const guidanceEs: Record<keyof typeof guidancePtBR, string> = {
  "guidance.whatToDo": "¿Qué debes hacer?",
  "guidance.reference": "Referencia técnica",
  "guidance.action.retry": "Intentar de nuevo",
  "guidance.action.chooseAnother": "Enviar otra demo",
  "guidance.action.selectPlayer": "Seleccionar mi jugador",
  "guidance.action.report": "Reportar problema",
  "guidance.action.understood": "Entendido",

  "guidance.processing.title": "Análisis en curso",
  "guidance.processing.body": "Tu demo está en la cola o se está procesando con normalidad.",
  "guidance.processing.todo":
    "No necesitas enviarla de nuevo. Sigue el estado aquí; el análisis continúa en el servidor.",
  "guidance.completed.title": "Análisis completado",
  "guidance.completed.body": "Tu partida fue procesada y vinculada a tu perfil.",
  "guidance.completed.todo": "No hay nada que hacer. Tus datos ya aparecen en tus análisis.",
  "guidance.partial.title": "Análisis completado con limitaciones",
  "guidance.partial.body":
    "Tu partida fue procesada, pero algunos datos no estaban disponibles en esta demo. Solo mostramos lo que realmente se midió.",
  "guidance.partial.todo":
    "No hay nada que hacer. Las métricas no disponibles quedan en blanco, nunca como cero.",
  "guidance.identity_pending.title": "Esperando identificación",
  "guidance.identity_pending.body":
    "Tu partida fue leída. Necesitamos confirmar qué jugador eres antes de finalizar tus estadísticas.",
  "guidance.identity_pending.todo": "Selecciona tu nickname para continuar el análisis.",
  "guidance.invalid_file.title": "No fue posible leer tu demo",
  "guidance.invalid_file.body":
    "No pudimos leer esta demo. El archivo puede estar incompleto o dañado.",
  "guidance.invalid_file.todo": "Elige otra demo e inténtalo de nuevo.",
  "guidance.incompatible_format.title": "Formato incompatible",
  "guidance.incompatible_format.body":
    "Este archivo no tiene un formato o tamaño compatible con CS2 PRO.",
  "guidance.incompatible_format.todo": "Selecciona una demo de CS2 válida en formato .dem.",
  "guidance.insufficient_sample.title": "Partida demasiado corta",
  "guidance.insufficient_sample.body":
    "La demo es válida, pero tiene pocas rondas utilizables para un análisis honesto.",
  "guidance.insufficient_sample.todo":
    "Envía otra demo de una partida más larga. Enviar esta misma demo de nuevo dará el mismo resultado.",
  "guidance.temporary_failure.title": "Ocurrió una falla temporal",
  "guidance.temporary_failure.body":
    "Nuestro sistema encontró una falla temporal durante el análisis. Tu demo sigue registrada en el historial.",
  "guidance.temporary_failure.todo":
    "No es necesario enviar la demo de nuevo. Inténtalo otra vez; si el problema continúa, repórtalo a nuestro equipo.",
  "guidance.service_issue.title": "Falla de nuestro lado",
  "guidance.service_issue.body":
    "El análisis se detuvo por un problema en nuestro servicio de análisis, no en tu archivo.",
  "guidance.service_issue.todo":
    "No envíes esta misma demo de nuevo por ahora. Reporta el problema para que nuestro equipo lo investigue.",
  "guidance.raw_audit_review.title": "Análisis retenido para revisión",
  "guidance.raw_audit_review.body":
    "Recibimos tu demo, pero algunos datos no pasaron las verificaciones de seguridad e integridad. Por seguridad, no generamos las estadísticas de esta partida.",
  "guidance.raw_audit_review.todo":
    "No es necesario enviar esta misma demo de nuevo. Nuestro equipo debe revisar el problema.",
  "guidance.canonical_review.title": "Validación de datos no completada",
  "guidance.canonical_review.body":
    "No fue posible validar los datos necesarios para generar las estadísticas de esta partida. Tus datos brutos se conservaron.",
  "guidance.canonical_review.todo":
    "Nuestro equipo debe verificar el motivo antes de poder completar el análisis. No envíes esta misma demo de nuevo.",
  "guidance.quarantined.title": "Partida en revisión",
  "guidance.quarantined.body":
    "Esta partida está retenida en revisión técnica y no puede procesarse de nuevo por ahora.",
  "guidance.quarantined.todo": "No envíes esta misma demo de nuevo. Repórtalo si necesitas ayuda.",
  "guidance.older_parser.title": "Analizada por una versión anterior",
  "guidance.older_parser.body":
    "Esta demo fue analizada por una versión anterior de nuestro analizador.",
  "guidance.older_parser.todo":
    "Usa “Reprocesar con el parser actual” en la tarjeta de esta demo. No hace falta enviar el archivo de nuevo.",
  "guidance.file_expired.title": "El archivo de esta demo expiró",
  "guidance.file_expired.body": "El archivo guardado de esta demo ya no está disponible.",
  "guidance.file_expired.todo": "Envía el archivo de nuevo para analizarlo.",
  "guidance.cancelled.title": "Análisis cancelado",
  "guidance.cancelled.body": "El análisis de esta demo fue cancelado. El historial se conservó.",
  "guidance.cancelled.todo": "Si quieres analizarla, envía la demo de nuevo.",
  "guidance.internal_error.title": "Ocurrió un problema inesperado",
  "guidance.internal_error.body": "Ocurrió un problema inesperado durante el análisis.",
  "guidance.internal_error.todo":
    "Nuestro equipo puede investigarlo. Envía un reporte para ayudarnos a identificar la causa.",
  "guidance.unknown.title": "Estado desconocido",
  "guidance.unknown.body": "Recibimos un estado que no reconocemos. Nada se consideró completado.",
  "guidance.unknown.todo": "Sigue esta demo en el historial o reporta el problema.",
};

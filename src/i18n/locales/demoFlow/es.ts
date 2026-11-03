import type { demoFlowPtBR } from "./pt-BR";

export const demoFlowEs: Record<keyof typeof demoFlowPtBR, string> = {
  "demoFlow.dialogLabel": "Análisis de tu demo",
  "demoFlow.file": "Archivo",
  "demoFlow.size": "Tamaño",
  "demoFlow.steps.label": "Etapas del análisis",
  "demoFlow.step.upload": "Envío",
  "demoFlow.step.validate": "Validación",
  "demoFlow.step.read": "Lectura de la partida",
  "demoFlow.step.metrics": "Métricas",
  "demoFlow.step.identify": "Identificación",
  "demoFlow.step.done": "Conclusión",
  "demoFlow.state.done": "completada",
  "demoFlow.state.active": "en curso",
  "demoFlow.state.pending": "en espera",
  "demoFlow.state.error": "con error",

  "demoFlow.upload.title": "Enviando tu demo",
  "demoFlow.upload.body": "Estamos enviando tu partida de forma segura para iniciar el análisis.",
  "demoFlow.upload.hashing": "Preparando el archivo (verificando el contenido)…",
  "demoFlow.upload.registering": "Registrando el envío…",
  "demoFlow.upload.uploading": "Enviando el archivo…",
  "demoFlow.upload.keepOpen":
    "Mantén esta página abierta hasta que termine el envío. Después, el análisis continúa en el servidor.",
  "demoFlow.upload.failedTitle": "No fue posible enviar la demo",
  "demoFlow.upload.tryAgain": "Elegir el archivo de nuevo",
  "demoFlow.upload.interruptedTitle": "El envío se interrumpió",
  "demoFlow.upload.interruptedBody":
    "La página se cerró o se recargó mientras se enviaba {file}, y el navegador no conserva el archivo. No se inició ningún análisis para este envío. Elige el mismo archivo de nuevo para enviarlo.",

  "demoFlow.validate.title": "Validando tu demo",
  "demoFlow.validate.body":
    "Estamos verificando el archivo y preparando tu partida para el procesamiento.",
  "demoFlow.validate.waitingJob": "Confirmando la recepción de la demo…",
  "demoFlow.validate.queued": "Tu demo está en la cola de procesamiento.",
  "demoFlow.validate.validating": "Validando el archivo de la demo.",

  "demoFlow.read.title": "Leyendo tu partida",
  "demoFlow.read.body":
    "Estamos analizando rondas, jugadores, eventos e información de la partida.",

  "demoFlow.metrics.title": "Calculando tus métricas",
  "demoFlow.metrics.body":
    "Estamos organizando los datos de la partida y preparando tu perfil de rendimiento.",
  "demoFlow.attaching.title": "Asociando la partida a tu jugador",
  "demoFlow.attaching.body":
    "Tu jugador está confirmado. Estamos vinculando esta partida y sus métricas a tu perfil.",

  "demoFlow.identify.title": "Identificando a tu jugador",
  "demoFlow.identify.body": "Estamos identificando tu perfil dentro de esta partida.",
  "demoFlow.identify.loadError": "No pudimos cargar los jugadores de esta partida.",
  "demoFlow.identify.reload": "Intentar cargar de nuevo",
  "demoFlow.identify.automaticTitle": "Te encontramos en esta partida",
  "demoFlow.identify.automaticBody":
    "Identificamos a tu jugador por la cuenta de Steam vinculada. Confirma para terminar el análisis.",
  "demoFlow.identify.confirmAutomatic": "Sí, soy yo",
  "demoFlow.select.title": "¿Cuál es tu nickname en esta partida?",
  "demoFlow.select.body":
    "Encontramos varios jugadores o no pudimos confirmar automáticamente cuál eres tú. Selecciona tu nickname para asociar correctamente tus estadísticas a tu perfil.",
  "demoFlow.select.cta": "Confirmar mi jugador",
  "demoFlow.select.required": "Selecciona un jugador para continuar.",
  "demoFlow.select.suggested": "Nickname de tu historial",
  "demoFlow.select.team": "Equipo",
  "demoFlow.select.later": "Decidir después (disponible en el historial)",

  "demoFlow.done.title": "¡Análisis completado!",
  "demoFlow.done.body": "Tu partida fue procesada y tus datos están listos.",
  "demoFlow.done.player": "Jugador",
  "demoFlow.done.map": "Mapa",
  "demoFlow.done.status": "Estado",
  "demoFlow.done.statusValue": "Procesada y vinculada a tu perfil",
  "demoFlow.done.cta": "Ver mi análisis",
  "demoFlow.done.close": "Cerrar",
  "demoFlow.done.autoClose": "Esta ventana se cierra sola en {seconds} s.",

  "demoFlow.failed.title": "El análisis no se completó",
  "demoFlow.failed.retryHint":
    "Puedes intentarlo de nuevo desde la tarjeta de esta demo en el historial, según las reglas de reintento.",
  "demoFlow.failed.selectAndRetry":
    "La partida se leyó, pero la etapa final falló. Selecciona tu jugador para iniciar un nuevo intento.",
  "demoFlow.cardAction.title": "Esta demo necesita una acción en el historial",
  "demoFlow.cardAction.reprocess":
    "Fue analizada por una versión anterior del parser. Usa el botón de la tarjeta para reprocesarla con el parser actual.",
  "demoFlow.cardAction.reupload":
    "El archivo de esta demo expiró. Envía el archivo de nuevo para analizarla.",
  "demoFlow.blocked.title": "Revisión necesaria",
  "demoFlow.cancelRequested.title": "Cancelando el análisis",
  "demoFlow.cancelled.title": "Análisis cancelado",
  "demoFlow.unknown.title": "Estado desconocido",
  "demoFlow.unknown.body":
    "Recibimos un estado que no reconocemos. Nada se consideró completado; sigue esta demo en el historial.",

  "demoFlow.cancel": "Cancelar análisis",
  "demoFlow.cancelConfirm": "Confirmar cancelación",
  "demoFlow.cancelKeep": "Seguir con el análisis",
  "demoFlow.cancelQuestion":
    "Cancelar detiene el análisis de esta demo. El historial se conserva. ¿Quieres cancelar?",
  "demoFlow.cancelError": "No fue posible cancelar ahora. El análisis continúa.",
  "demoFlow.background": "Continuar en segundo plano",
  "demoFlow.backgroundHint":
    "El análisis sigue en el servidor; síguelo en la tarjeta del historial.",
  "demoFlow.close": "Cerrar",
  "demoFlow.reconnecting": "Sin conexión. Intentando reconectar y retomar el seguimiento…",
  "demoFlow.resumed": "Retomamos el seguimiento de esta demo.",
  "demoFlow.leaveWarning": "El envío de la demo sigue en curso. Salir ahora interrumpe el envío.",
};

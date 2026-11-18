import type { reviewPtBR } from "./pt-BR";

export const reviewEs: Record<keyof typeof reviewPtBR, string> = {
  "review.title": "Revisión mensual (vista previa)",
  "review.subtitle": "Resumen del mes con tus propios datos (cs2.monthly-review.v1)",
  "review.noMatches": "Ninguna partida este mes.",
  "review.matches": "{n} partidas en el mes.",
  "review.lowSample":
    "{n} partida(s) en el mes: muestra pequeña (menos de {min}); lee los números con cautela.",
  "review.processedDates": "Algunas fechas son de procesamiento, no de la partida.",
  "review.nMatches": "{n} partidas",
  "review.vsPrevious": "mes anterior {v} ({n} partidas)",
  "review.comparison.INSUFFICIENT_SAMPLE": "sin comparación (muestra insuficiente)",
  "review.comparison.INCOMPATIBLE_METHODS": "sin comparación (métodos distintos)",
  "review.comparison.NO_PREVIOUS_MONTH": "sin partidas el mes anterior",
  "review.training":
    "Entrenamiento: {done} sesiones hechas y {skipped} omitidas, de {due} previstas.",
  "review.noPlan": "Sin plan de entrenamiento abierto.",
  "review.moments": "{n} momento(s) guardado(s) en el mes.",
  "review.notSent":
    "Vista previa solo en esta página: nada se envía por e-mail ni mensaje. Un envío requeriría tu consentimiento explícito, que aún no está disponible.",
};

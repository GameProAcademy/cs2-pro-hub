import type { reviewPtBR } from "./pt-BR";

export const reviewPtPT: Record<keyof typeof reviewPtBR, string> = {
  "review.title": "Revisão mensal (pré-visualização)",
  "review.subtitle": "Resumo do mês com os seus próprios dados (cs2.monthly-review.v1)",
  "review.noMatches": "Nenhum jogo neste mês.",
  "review.matches": "{n} jogos no mês.",
  "review.lowSample":
    "{n} jogo(s) no mês: amostra pequena (menos de {min}); leia os números com cautela.",
  "review.processedDates": "Algumas datas são de processamento, não do jogo.",
  "review.nMatches": "{n} jogos",
  "review.vsPrevious": "mês anterior {v} ({n} jogos)",
  "review.comparison.INSUFFICIENT_SAMPLE": "sem comparação (amostra insuficiente)",
  "review.comparison.INCOMPATIBLE_METHODS": "sem comparação (métodos diferentes)",
  "review.comparison.NO_PREVIOUS_MONTH": "sem jogos no mês anterior",
  "review.training":
    "Treino: {done} sessões concluídas e {skipped} saltadas, de {due} já previstas.",
  "review.noPlan": "Sem plano de treino aberto.",
  "review.moments": "{n} momento(s) guardado(s) no mês.",
  "review.notSent":
    "Pré-visualização apenas nesta página: nada é enviado por e-mail ou mensagem. Um envio exigiria o seu consentimento explícito, que ainda não está disponível.",
};

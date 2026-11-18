import type { benchmarksPtBR } from "./pt-BR";

export const benchmarksPtPT: Record<keyof typeof benchmarksPtBR, string> = {
  "benchmarks.title": "Comparação com profissionais",
  "benchmarks.subtitle": "Benchmarks profissionais (cs2.pro-benchmark.v1)",
  "benchmarks.unavailable.title": "Indisponível.",
  "benchmarks.unavailable.body":
    "Não há fonte de dados de jogadores profissionais de CS2 licenciada para este uso e calculada da mesma forma que as suas métricas. Por isso nenhuma média profissional é mostrada ou estimada.",
  "benchmarks.available": "{n} fonte(s) licenciada(s) e comparável(is) disponível(is).",
  "benchmarks.rules":
    "Uma fonte só é usada com licença verificada que permita mostrar dados derivados, recolha autorizada (nunca scraping), dados de CS2, o mesmo método das suas métricas e pelo menos {min} jogos.",
  "benchmarks.audit": "Fontes avaliadas e porque não são usadas",
  "benchmarks.finding.NO_LICENSE_FOUND": "nenhuma licença para este uso encontrada",
  "benchmarks.finding.TERMS_RESTRICT_REUSE": "os termos restringem a reutilização dos dados",
  "benchmarks.finding.SCRAPED_ORIGIN": "dados recolhidos por scraping",
  "benchmarks.finding.NO_PRO_DATASET": "não oferece um conjunto de dados profissionais",
  "benchmarks.finding.OWN_PLAYER_DATA_ONLY": "só dados do próprio jogador",
};

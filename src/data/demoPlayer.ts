/**
 * ⚠️ MOCK / DEMONSTRATION DATA ONLY — gated by DEMO_DATA in src/config/app.ts.
 *
 * None of these values come from a real demo (.dem) file, parser, database or
 * AI model. They exist exclusively to render the interface of this first stage.
 * Replace this module with the services layer output when the real pipeline
 * exists — component props are already shaped for that swap.
 */
import type {
  Bottleneck,
  CoachMessage,
  DnaPoint,
  MapPerformance,
  MatchRow,
  Metric,
  PlayerProfile,
  ProScore,
  SideSplit,
  Strength,
  TimeSeriesPoint,
  TrainingPlan,
} from "@/types";

export const demoProScore: ProScore = {
  value: 74,
  max: 100,
  deltaSinceFirstAnalysis: 8,
  tier: "Competitivo Avançado",
  percentile: 82,
};

export const demoPlayerDna: DnaPoint[] = [
  { dimension: "aim", value: 84, average: 62 },
  { dimension: "dueling", value: 76, average: 60 },
  { dimension: "survivability", value: 51, average: 61 },
  { dimension: "positioning", value: 63, average: 60 },
  { dimension: "utility", value: 44, average: 58 },
  { dimension: "decision_making", value: 41, average: 59 },
  { dimension: "teamplay", value: 79, average: 61 },
  { dimension: "economy", value: 66, average: 60 },
  { dimension: "clutch", value: 81, average: 57 },
  { dimension: "consistency", value: 58, average: 60 },
];

export const demoBottlenecks: Bottleneck[] = [
  {
    id: "bn-1",
    area: "decision_making",
    priority: "Crítica",
    impact: "-9 pts no CS2 PRO Score",
    confidence: 88,
    explanation:
      "Decisões de rotação tardias em situações 4v5 e overpeeks após a primeira troca. O padrão aparece principalmente nos rounds pós-plant do lado T.",
  },
  {
    id: "bn-2",
    area: "utility",
    priority: "Alta",
    impact: "-6 pts no CS2 PRO Score",
    confidence: 81,
    explanation:
      "Baixo dano e baixo aproveitamento de utilitário por round. Granadas frequentemente terminam o round sem uso, reduzindo o suporte à execução do time.",
  },
  {
    id: "bn-3",
    area: "survivability",
    priority: "Média",
    impact: "-4 pts no CS2 PRO Score",
    confidence: 74,
    explanation:
      "Taxa de primeira morte elevada em mapas abertos. Trocas de posição sem cobertura aumentam a exposição em ângulos múltiplos.",
  },
];

export const demoStrengths: Strength[] = [
  {
    id: "st-1",
    area: "aim",
    summary:
      "Precisão de primeira bala e controle de spray consistentes em curta e média distância.",
    percentile: 91,
  },
  {
    id: "st-2",
    area: "teamplay",
    summary: "Alta taxa de trade kills e presença próxima ao núcleo do time nas execuções.",
    percentile: 84,
  },
  {
    id: "st-3",
    area: "clutch",
    summary: "Conversão acima da média em situações 1v1 e 1v2 com tempo suficiente de round.",
    percentile: 88,
  },
];

export const demoMetrics: Metric[] = [
  { key: "kd", label: "K/D", value: "1.18", delta: 0.09 },
  { key: "adr", label: "ADR", value: "84.6", delta: 4.2 },
  { key: "kast", label: "KAST", value: "71.4", unit: "%", delta: 1.8 },
  { key: "hs", label: "HS%", value: "52.3", unit: "%", delta: -1.1 },
  { key: "fkr", label: "First Kill Rate", value: "14.2", unit: "%", delta: 0.6 },
  { key: "fdr", label: "First Death Rate", value: "17.9", unit: "%", delta: -2.3 },
  { key: "opening", label: "Opening Success", value: "44.2", unit: "%", delta: 3.1 },
  { key: "clutch", label: "Clutches", value: "9", hint: "metric.hint.last20", delta: 2 },
  { key: "multi", label: "Multi-kills", value: "37", hint: "metric.hint.multiKills", delta: 5 },
];

export const demoScoreTrend: TimeSeriesPoint[] = [
  { label: "Jan", score: 66 },
  { label: "Fev", score: 68 },
  { label: "Mar", score: 67 },
  { label: "Abr", score: 70 },
  { label: "Mai", score: 71 },
  { label: "Jun", score: 73 },
  { label: "Jul", score: 74 },
];

export const demoKdTrend: TimeSeriesPoint[] = [
  { label: "Jan", kd: 1.02 },
  { label: "Fev", kd: 1.07 },
  { label: "Mar", kd: 1.04 },
  { label: "Abr", kd: 1.11 },
  { label: "Mai", kd: 1.09 },
  { label: "Jun", kd: 1.15 },
  { label: "Jul", kd: 1.18 },
];

export const demoAdrTrend: TimeSeriesPoint[] = [
  { label: "Jan", adr: 74 },
  { label: "Fev", adr: 76 },
  { label: "Mar", adr: 79 },
  { label: "Abr", adr: 78 },
  { label: "Mai", adr: 81 },
  { label: "Jun", adr: 83 },
  { label: "Jul", adr: 85 },
];

export const demoKastTrend: TimeSeriesPoint[] = [
  { label: "Jan", kast: 66 },
  { label: "Fev", kast: 67 },
  { label: "Mar", kast: 68 },
  { label: "Abr", kast: 69 },
  { label: "Mai", kast: 70 },
  { label: "Jun", kast: 70 },
  { label: "Jul", kast: 71 },
];

export const demoHsTrend: TimeSeriesPoint[] = [
  { label: "Jan", hs: 48 },
  { label: "Fev", hs: 50 },
  { label: "Mar", hs: 53 },
  { label: "Abr", hs: 55 },
  { label: "Mai", hs: 54 },
  { label: "Jun", hs: 53 },
  { label: "Jul", hs: 52 },
];

export const demoOpeningTrend: TimeSeriesPoint[] = [
  { label: "Jan", firstKill: 12.1, firstDeath: 21.4 },
  { label: "Fev", firstKill: 12.8, firstDeath: 20.8 },
  { label: "Mar", firstKill: 13.2, firstDeath: 20.1 },
  { label: "Abr", firstKill: 13.0, firstDeath: 19.4 },
  { label: "Mai", firstKill: 13.7, firstDeath: 19.0 },
  { label: "Jun", firstKill: 14.0, firstDeath: 18.2 },
  { label: "Jul", firstKill: 14.2, firstDeath: 17.9 },
];

export const demoMapPerformance: MapPerformance[] = [
  { map: "Mirage", matches: 42, winRate: 61, rating: 1.14, adr: 88 },
  { map: "Inferno", matches: 31, winRate: 55, rating: 1.06, adr: 82 },
  { map: "Nuke", matches: 18, winRate: 39, rating: 0.91, adr: 71 },
  { map: "Ancient", matches: 22, winRate: 52, rating: 1.03, adr: 80 },
  { map: "Anubis", matches: 16, winRate: 48, rating: 0.98, adr: 77 },
  { map: "Dust2", matches: 27, winRate: 63, rating: 1.17, adr: 90 },
  { map: "Overpass", matches: 12, winRate: 41, rating: 0.94, adr: 73 },
];

export const demoSideSplit: SideSplit[] = [
  { metric: "Rating", ct: 1.12, t: 0.97 },
  { metric: "ADR", ct: 88, t: 79 },
  { metric: "KAST", ct: 74, t: 68 },
  { metric: "Opening Success", ct: 49, t: 39 },
  { metric: "First Death Rate", ct: 15.4, t: 20.6 },
];

export const demoMatches: MatchRow[] = [
  {
    id: "m-1",
    date: "2026-08-28",
    platform: "FACEIT",
    map: "Mirage",
    result: "V",
    score: "13-9",
    kills: 24,
    deaths: 17,
    adr: 92.4,
    kast: 74,
    rating: 1.24,
  },
  {
    id: "m-2",
    date: "2026-08-27",
    platform: "Gamers Club",
    map: "Inferno",
    result: "D",
    score: "10-13",
    kills: 18,
    deaths: 20,
    adr: 78.1,
    kast: 68,
    rating: 0.98,
  },
  {
    id: "m-3",
    date: "2026-08-26",
    platform: "FACEIT",
    map: "Nuke",
    result: "D",
    score: "8-13",
    kills: 15,
    deaths: 21,
    adr: 68.9,
    kast: 63,
    rating: 0.86,
  },
  {
    id: "m-4",
    date: "2026-08-25",
    platform: "Matchmaking",
    map: "Dust2",
    result: "V",
    score: "13-7",
    kills: 27,
    deaths: 14,
    adr: 101.3,
    kast: 81,
    rating: 1.42,
  },
  {
    id: "m-5",
    date: "2026-08-24",
    platform: "FACEIT",
    map: "Ancient",
    result: "V",
    score: "13-11",
    kills: 22,
    deaths: 19,
    adr: 86.7,
    kast: 72,
    rating: 1.12,
  },
  {
    id: "m-6",
    date: "2026-08-22",
    platform: "Gamers Club",
    map: "Anubis",
    result: "E",
    score: "12-12",
    kills: 21,
    deaths: 21,
    adr: 81.5,
    kast: 70,
    rating: 1.04,
  },
  {
    id: "m-7",
    date: "2026-08-21",
    platform: "FACEIT",
    map: "Overpass",
    result: "D",
    score: "9-13",
    kills: 16,
    deaths: 20,
    adr: 71.2,
    kast: 64,
    rating: 0.89,
  },
  {
    id: "m-8",
    date: "2026-08-20",
    platform: "FACEIT",
    map: "Mirage",
    result: "V",
    score: "13-6",
    kills: 25,
    deaths: 12,
    adr: 97.8,
    kast: 83,
    rating: 1.38,
  },
];

export const demoTrainingPlans: TrainingPlan[] = [
  {
    horizon: 30,
    title: "Plano 30 dias — Correção dos gargalos",
    goal: "Reduzir erros de decisão em rounds pós-plant e elevar o uso de utilitário por round.",
    focus: ["decision_making", "utility"],
    progress: 42,
    tasks: [
      {
        title: "Revisão de rounds perdidos",
        detail: "Assistir 3 rounds pós-plant por sessão e anotar a decisão alternativa.",
        frequency: "4x/semana",
      },
      {
        title: "Rotina de utilitário",
        detail: "Bloco de smokes e molotovs padrão de Mirage e Inferno.",
        frequency: "15 min/dia",
      },
      {
        title: "Disciplina de peek",
        detail: "Um duelo por round, sem repeek imediato após troca.",
        frequency: "Todas as partidas",
      },
    ],
  },
  {
    horizon: 60,
    title: "Plano 60 dias — Desenvolvimento de habilidades",
    goal: "Transformar a consistência mecânica em vantagem estável de rounds abertos.",
    focus: ["positioning", "consistency", "survivability"],
    progress: 12,
    tasks: [
      {
        title: "Mapa fraco em foco",
        detail: "Ciclo dedicado a Nuke e Overpass com metas de rating por partida.",
        frequency: "2x/semana",
      },
      {
        title: "Treino de reposicionamento",
        detail: "Sair de ângulo após dois tiros e reencontrar cobertura.",
        frequency: "3x/semana",
      },
      {
        title: "Aim consistente",
        detail: "Bloco fixo de recoil control e troca de alvos.",
        frequency: "20 min/dia",
      },
    ],
  },
  {
    horizon: 90,
    title: "Plano 90 dias — Consolidação competitiva",
    goal: "Consolidar o novo padrão de jogo em ambiente competitivo contínuo.",
    focus: ["decision_making", "teamplay", "economy"],
    progress: 0,
    tasks: [
      {
        title: "Ciclo competitivo",
        detail: "Séries semanais com revisão de desempenho e metas por mapa.",
        frequency: "Semanal",
      },
      {
        title: "Gestão de economia",
        detail: "Definir regras de force buy e save junto ao time.",
        frequency: "Semanal",
      },
      {
        title: "Revisão de evolução",
        detail: "Comparar CS2 PRO Score e Player DNA com a linha de base.",
        frequency: "Mensal",
      },
    ],
  },
];

export const demoCoachMessages: CoachMessage[] = [
  {
    id: "c-1",
    role: "coach",
    content:
      "Exemplo de resposta (mensagem demonstrativa — o AI Coach ainda não está conectado a nenhum modelo). Seu maior gargalo aparente é Decision Making em rounds pós-plant: as rotações começam tarde e você entra em duelos sem cobertura.",
    time: "10:02",
  },
  {
    id: "c-2",
    role: "player",
    content: "Como eu treino isso na prática?",
    time: "10:03",
  },
  {
    id: "c-3",
    role: "coach",
    content:
      "Exemplo de resposta (demonstrativa). Comece revisando três rounds pós-plant por sessão e escrevendo a decisão alternativa que você tomaria. Depois, limite-se a um duelo por round nas próximas cinco partidas.",
    time: "10:03",
  },
];

export const demoProfile: PlayerProfile = {
  name: "Jogador Demonstração",
  email: "jogador@exemplo.com",
  country: "Brasil",
  platform: "FACEIT",
  level: "FACEIT Level 8",
  goal: "Entrar em time competitivo",
  role: "Rifler / Entry",
  experience: "4 anos",
  preferences: { emailReports: true, weeklyPlan: true, publicProfile: false },
};

export const demoAnalysis = {
  overall:
    "Perfil mecanicamente forte com déficit tático. O impacto individual é alto em duelos, mas o aproveitamento de rounds cai quando a decisão do round depende de leitura e de utilitário.",
  evidence: [
    "First Death Rate de 20.6% no lado T contra 15.4% no lado CT.",
    "Uso de utilitário por round abaixo da faixa esperada para o nível declarado.",
    "Queda de rating em mapas com rotações longas (Nuke e Overpass).",
    "Conversão acima da média em clutch, indicando calma em situações isoladas.",
  ],
  priority:
    "Prioridade #1: decisão em rounds pós-plant do lado T. É o item com maior impacto estimado no CS2 PRO Score.",
  recommendation:
    "Executar o Plano 30 dias com foco em revisão de rounds e disciplina de peek antes de aumentar volume de treino mecânico.",
  confidence: 84,
};

/**
 * ⚠️ MOCK / DEMONSTRATION DATA ONLY — gated by DEMO_DATA in src/config/app.ts.
 *
 * Lesson URLs are placeholders. No CS2 PRO course catalog is integrated yet.
 * The shape is the contract for the future flow:
 *
 *   detected problem -> skill (DnaDimension) -> CS2 PRO lesson -> "Watch lesson"
 *
 * Components never hardcode lesson URLs; they read them from here through the
 * services layer.
 */
import type { CourseLesson } from "@/types";

export const demoLessons: CourseLesson[] = [
  {
    lessonId: "cs2pro-decision-01",
    title: "Leitura de round pós-plant",
    description:
      "Como decidir entre rotação, hold e reagrupamento nos primeiros 15 segundos após o plant.",
    module: "Tomada de decisão",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["decision_making", "positioning"],
    recommendedFor: [30],
    duration: "18 min",
    isDemoLink: true,
  },
  {
    lessonId: "cs2pro-utility-01",
    title: "Utilitário padrão de Mirage e Inferno",
    description: "Sequências de smoke, flash e molotov que sustentam a execução do time.",
    module: "Utilitário",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["utility", "teamplay"],
    recommendedFor: [30],
    duration: "24 min",
    isDemoLink: true,
  },
  {
    lessonId: "cs2pro-peek-01",
    title: "Disciplina de duelo e repeek",
    description: "Quando abrir o ângulo, quando recuar e como evitar o segundo duelo desnecessário.",
    module: "Duelos",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["dueling", "survivability"],
    recommendedFor: [30, 60],
    duration: "15 min",
    isDemoLink: true,
  },
  {
    lessonId: "cs2pro-positioning-01",
    title: "Reposicionamento sob pressão",
    description: "Rotinas de troca de ângulo e recuperação de cobertura em mapas abertos.",
    module: "Posicionamento",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["positioning", "survivability"],
    recommendedFor: [60],
    duration: "21 min",
    isDemoLink: true,
  },
  {
    lessonId: "cs2pro-aim-01",
    title: "Controle de recuo e troca de alvos",
    description: "Bloco de treino mecânico com metas objetivas por sessão.",
    module: "Mecânica",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["aim", "consistency"],
    recommendedFor: [60],
    duration: "17 min",
    isDemoLink: true,
  },
  {
    lessonId: "cs2pro-economy-01",
    title: "Gestão de economia em equipe",
    description: "Regras de force buy, save e reset alinhadas com o restante do time.",
    module: "Economia",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["economy", "teamplay"],
    recommendedFor: [90],
    duration: "20 min",
    isDemoLink: true,
  },
  {
    lessonId: "cs2pro-review-01",
    title: "Rotina de revisão competitiva",
    description: "Como comparar CS2 PRO Score e Player DNA ao longo de um ciclo de 90 dias.",
    module: "Evolução",
    lessonUrl: null,
    locale: "pt-BR",
    relatedSkills: ["consistency", "decision_making"],
    recommendedFor: [90],
    duration: "26 min",
    isDemoLink: true,
  },
];

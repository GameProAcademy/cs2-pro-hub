import type { catalogPtBR } from "./pt-BR";

export const catalogPtPT: Record<keyof typeof catalogPtBR, string> = {
  "admin.nav.catalog": "Catálogo de cursos",
  "catalog.admin.title": "Catálogo de cursos e aulas",
  "catalog.admin.subtitle":
    "Fonte única dos cursos e aulas usados no Meu Treino e no AI Coach. Só itens ativos, com idioma confirmado e trilha classificada são recomendados.",
  "catalog.admin.tab.lessons": "Aulas",
  "catalog.admin.tab.groups": "Trilhas e grupos",
  "catalog.admin.tab.import": "Importar",
  "catalog.admin.search": "Pesquisar por título ou URL",
  "catalog.admin.all": "Todos",
  "catalog.admin.col.title": "Título",
  "catalog.admin.col.locale": "Idioma",
  "catalog.admin.col.status": "Estado do idioma",
  "catalog.admin.col.track": "Trilha",
  "catalog.admin.col.topics": "Temas",
  "catalog.admin.col.lessons": "Aulas",
  "catalog.admin.col.courses": "Cursos",
  "catalog.admin.col.source": "Origem da classificação",
  "catalog.admin.status.confirmed": "Confirmado",
  "catalog.admin.status.pending": "Pendente de validação",
  "catalog.admin.active": "Ativo",
  "catalog.admin.inactive": "Inativo",
  "catalog.admin.edit": "Editar",
  "catalog.admin.save": "Guardar",
  "catalog.admin.cancel": "Cancelar",
  "catalog.admin.activate": "Ativar",
  "catalog.admin.deactivate": "Desativar",
  "catalog.admin.delete": "Eliminar",
  "catalog.admin.confirmDelete":
    "Eliminar esta aula definitivamente? Prefira desativar se ela puder voltar.",
  "catalog.admin.field.url": "URL",
  "catalog.admin.field.topicsHint":
    "Códigos separados por vírgula (ex.: utility, aim, positioning)",
  "catalog.admin.saved": "Alteração guardada.",
  "catalog.admin.error":
    "Não foi possível guardar. Verifique o URL (apenas hub.gamepro.academy, nunca sample-course) e se já existe no catálogo.",
  "catalog.admin.empty": "Nenhum item corresponde a estes filtros.",
  "catalog.track.counter_strike_in_game": "Treino Counter-Strike",
  "catalog.track.strategic_knowledge": "Conhecimentos Estratégicos",
  "catalog.track.extra_skills": "Habilidades Extra",
  "catalog.track.unclassified": "Não classificado",
  "catalog.admin.import.help":
    "Envie o training_catalog.json ou os CSV (cursos e/ou aulas). Simule primeiro: nada é gravado. Ao aplicar, itens novos são incluídos e alterações atualizadas; nada que não esteja no ficheiro é apagado, e decisões tomadas aqui (idioma, trilha) são preservadas.",
  "catalog.admin.import.json": "Ficheiro JSON do catálogo",
  "catalog.admin.import.coursesCsv": "CSV de cursos (opcional)",
  "catalog.admin.import.lessonsCsv": "CSV de aulas (opcional)",
  "catalog.admin.import.simulate": "Simular importação",
  "catalog.admin.import.apply": "Aplicar importação",
  "catalog.admin.import.report": "Relatório",
  "catalog.admin.import.inserted": "novos",
  "catalog.admin.import.updated": "atualizados",
  "catalog.admin.import.unchanged": "sem alteração",
  "catalog.admin.import.notInFile": "na base e fora do ficheiro (mantidos)",
  "catalog.admin.import.rejected": "rejeitados",
  "catalog.admin.import.pending": "aulas com idioma pendente",
  "catalog.admin.import.simulated": "Simulação: nada foi gravado.",
  "catalog.admin.import.applied": "Importação aplicada.",
  "catalog.admin.import.failed":
    "Importação recusada. O ficheiro não pôde ser lido ou é grande demais (máx. 5 MB).",
  "training.real.noPlayer":
    "Ainda não há um jogador associado à sua conta. Envie uma demo e confirme qual jogador é você para gerar o plano.",
  "training.real.noData":
    "Ainda não há partidas processadas. O plano usa apenas os seus dados reais; envie uma demo para começar.",
  "training.real.noPriority":
    "Nenhuma dimensão do seu Player DNA está abaixo de 60 / 100 e não declarou objetivos no perfil: não há prioridade a corrigir. Mantenha a rotina e defina um objetivo no perfil para receber recomendações.",
  "training.real.provisional":
    "Amostra pequena ({matches} partida(s)): as prioridades são provisórias e serão revistas a cada nova demo.",
  "training.real.catalogUnavailable":
    "O catálogo de aulas está indisponível neste momento; o plano mostra apenas as atividades práticas.",
  "training.real.goals": "Os seus objetivos",
  "training.real.noGoals": "Nenhum objetivo declarado no perfil.",
  "training.real.priorities": "Prioridades (dimensões mais baixas do seu Player DNA)",
  "training.real.week": "Semana",
  "training.real.focusConsolidation": "Consolidação e revisão",
  "training.real.practice": "Prática no CS2",
  "training.real.lessons": "Aulas recomendadas",
  "training.real.complementary": "Trilhas complementares",
  "training.real.complementaryHint":
    "Conteúdos de outras trilhas ligados às suas prioridades. Sugestão: uma aula por semana.",
  "training.real.frequency": "Sugestão: 3 a 4 sessões por semana, por esta ordem.",
  "training.real.open": "Abrir aula",
  "training.real.openCourse": "Abrir curso",
  "training.real.why.dna": "A sua dimensão {dimension} está em {value}.",
  "training.real.why.goal": "Ligada ao seu objetivo: {goal}.",
  "training.real.why.map": "Posições do mapa {map}, que jogou.",
  "training.real.noLesson": "Sem aula no catálogo para esta prioridade no seu idioma.",
  "training.practice.aim":
    "15 min de aim_botz com a mira à altura da cabeça + 10 min de deathmatch só com one-taps.",
  "training.practice.dueling":
    "Prática de peeks (wide e jiggle) em mapa de treino e revisão dos seus duelos de abertura na demo.",
  "training.practice.survivability":
    "Em cada partida, anote as mortes sem troca e reveja a posição de cada uma na demo.",
  "training.practice.positioning":
    "Treine as posições padrão dos mapas que joga, de CT e de TR, em servidor local.",
  "training.practice.utility":
    "Aprenda 3 smokes e 2 flashes de execução do seu mapa principal e use-as em todas as partidas.",
  "training.practice.decision_making":
    "Depois de cada ronda perdida, escreva numa linha que decisão mudaria o resultado.",
  "training.practice.teamplay":
    "Combine com a equipa trades e flashes para o colega; reveja na demo se o trade aconteceu.",
  "training.practice.economy":
    "Antes de cada ronda, decida em voz alta compra completa, force ou eco com a equipa.",
  "training.practice.clutch":
    "Treine situações de 1v1 e 1v2 em servidor de retake, priorizando informação antes do tiro.",
  "training.practice.consistency":
    "Mesmo aquecimento de 20 min antes de cada sessão (aim, spray, deathmatch) e no máximo 3 partidas seguidas.",
  "training.practice.demo_review":
    "Veja a sua última demo e marque 3 rondas para corrigir; compare com a semana 1.",
  "coach.catalog.label": "Aula recomendada",
};

import type { coach2PtBR } from "./pt-BR";

export const coach2PtPT: Record<keyof typeof coach2PtBR, string> = {
  "coach2.conversations": "Conversas",
  "coach2.conversationsEmpty": "Ainda não há conversas guardadas.",
  "coach2.untitled": "Conversa sem título",
  "coach2.delete": "Apagar conversa",
  "coach2.deleteConfirm": "Confirmar: apagar",
  "coach2.deleteCancel": "Cancelar",
  "coach2.deleteError": "Não foi possível apagar a conversa. Tente novamente.",
  "coach2.loadError": "Não foi possível carregar esta conversa.",
  "coach2.personalize": "Personalizar",
  "coach2.prefs.title": "Personalize o seu Coach (opcional)",
  "coach2.prefs.description":
    "Diga ao Coach onde quer focar-se. É o que declara, não uma medição: pode alterar ou apagar quando quiser.",
  "coach2.prefs.difficulty": "Principal dificuldade",
  "coach2.prefs.difficultyNone": "Não indicar",
  "coach2.prefs.diff.AIM": "Pontaria",
  "coach2.prefs.diff.POSITIONING": "Posicionamento",
  "coach2.prefs.diff.UTILITY": "Granadas e utilitários",
  "coach2.prefs.diff.ECONOMY": "Economia",
  "coach2.prefs.diff.DECISIONS": "Tomada de decisão",
  "coach2.prefs.diff.TEAMPLAY": "Jogo de equipa e comunicação",
  "coach2.prefs.diff.CONSISTENCY": "Consistência",
  "coach2.prefs.diff.MINDSET": "Mentalidade",
  "coach2.prefs.maps": "Mapas de interesse",
  "coach2.prefs.profileNote":
    "Objetivo, nível e função ficam no seu perfil, e o Coach também os usa.",
  "coach2.prefs.openProfile": "Editar no perfil",
  "coach2.prefs.save": "Guardar",
  "coach2.prefs.saved": "Preferências guardadas.",
  "coach2.prefs.remove": "Apagar preferências",
  "coach2.prefs.removed": "Preferências apagadas.",
  "coach2.prefs.close": "Fechar",
  "coach2.prefs.error": "Não foi possível guardar. Tente novamente.",
  "coach2.onboarding.hint":
    "Opcional: diga ao Coach a sua principal dificuldade e os seus mapas para respostas mais focadas.",
  "coach2.onboarding.dismiss": "Agora não",
  "coach2.suggestions": "Sugestões de perguntas",
  "coach2.suggestion.1": "Em que devo focar o treino esta semana?",
  "coach2.suggestion.2": "O que mostram os meus números nas últimas partidas?",
  "coach2.suggestion.3": "Como posso usar melhor as granadas?",
  "coach2.suggestion.4": "Estou a morrer cedo demais nas rondas?",
  "coach2.error.timeout":
    "O Coach demorou demasiado a responder. Tente novamente dentro de instantes.",
  "coach2.error.providerConfig":
    "O Coach está indisponível de momento devido a um problema de configuração. O problema foi registado.",
  "coach2.error.noCredits":
    "O Coach está temporariamente indisponível. Tente novamente mais tarde.",
  "coach2.error.modelUnavailable":
    "O modelo do Coach está indisponível de momento. Tente novamente mais tarde.",
  "coach2.error.inProgress":
    "Esta pergunta ainda está a ser respondida. Aguarde alguns segundos e tente novamente.",
  "coach2.error.persist": "A resposta foi gerada, mas não pôde ser guardada. Tente novamente.",
  "coach2.error.invalidResponse": "O Coach devolveu uma resposta inválida. Tente novamente.",
};

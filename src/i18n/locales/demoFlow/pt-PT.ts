import type { demoFlowPtBR } from "./pt-BR";

export const demoFlowPtPT: Record<keyof typeof demoFlowPtBR, string> = {
  "demoFlow.dialogLabel": "Análise da sua demo",
  "demoFlow.file": "Ficheiro",
  "demoFlow.size": "Tamanho",
  "demoFlow.steps.label": "Etapas da análise",
  "demoFlow.step.upload": "Envio",
  "demoFlow.step.validate": "Validação",
  "demoFlow.step.read": "Leitura da partida",
  "demoFlow.step.metrics": "Métricas",
  "demoFlow.step.identify": "Identificação",
  "demoFlow.step.done": "Conclusão",
  "demoFlow.state.done": "concluída",
  "demoFlow.state.active": "em curso",
  "demoFlow.state.pending": "a aguardar",
  "demoFlow.state.error": "com erro",

  "demoFlow.upload.title": "A enviar a sua demo",
  "demoFlow.upload.body": "Estamos a enviar a sua partida em segurança para iniciar a análise.",
  "demoFlow.upload.hashing": "A preparar o ficheiro (a verificar o conteúdo)…",
  "demoFlow.upload.registering": "A registar o envio…",
  "demoFlow.upload.uploading": "A enviar o ficheiro…",
  "demoFlow.upload.keepOpen":
    "Mantenha esta página aberta até o envio terminar. Depois disso, a análise continua no servidor.",
  "demoFlow.upload.failedTitle": "Não foi possível enviar a demo",
  "demoFlow.upload.tryAgain": "Escolher o ficheiro novamente",
  "demoFlow.upload.interruptedTitle": "O envio foi interrompido",
  "demoFlow.upload.interruptedBody":
    "A página foi fechada ou recarregada enquanto o ficheiro {file} era enviado, e o navegador não guarda o ficheiro. Nenhuma análise foi iniciada para este envio. Escolha o mesmo ficheiro novamente para o enviar.",

  "demoFlow.validate.title": "A validar a sua demo",
  "demoFlow.validate.body":
    "Estamos a verificar o ficheiro e a preparar a sua partida para processamento.",
  "demoFlow.validate.waitingJob": "A confirmar a receção da demo…",
  "demoFlow.validate.queued": "A sua demo está na fila de processamento.",
  "demoFlow.validate.validating": "A validar o ficheiro da demo.",

  "demoFlow.read.title": "A ler a sua partida",
  "demoFlow.read.body": "Estamos a analisar rondas, jogadores, eventos e informações da partida.",

  "demoFlow.metrics.title": "A calcular as suas métricas",
  "demoFlow.metrics.body":
    "Estamos a organizar os dados da partida e a preparar o seu perfil de desempenho.",
  "demoFlow.attaching.title": "A associar a partida ao seu jogador",
  "demoFlow.attaching.body":
    "O seu jogador foi confirmado. Estamos a ligar esta partida e as métricas ao seu perfil.",

  "demoFlow.identify.title": "A identificar o seu jogador",
  "demoFlow.identify.body": "Estamos a identificar o seu perfil dentro desta partida.",
  "demoFlow.identify.loadError": "Não conseguimos carregar os jogadores desta partida.",
  "demoFlow.identify.reload": "Tentar carregar novamente",
  "demoFlow.identify.automaticTitle": "Encontrámo-lo nesta partida",
  "demoFlow.identify.automaticBody":
    "Identificámos o seu jogador pela conta Steam associada. Confirme para concluir a análise.",
  "demoFlow.identify.confirmAutomatic": "Sim, sou eu",
  "demoFlow.select.title": "Qual é o seu nickname nesta partida?",
  "demoFlow.select.body":
    "Encontrámos vários jogadores ou não conseguimos confirmar automaticamente qual deles é o seu. Selecione o seu nickname para associarmos corretamente as suas estatísticas ao seu perfil.",
  "demoFlow.select.cta": "Confirmar o meu jogador",
  "demoFlow.select.required": "Selecione um jogador para continuar.",
  "demoFlow.select.suggested": "Nickname do seu histórico",
  "demoFlow.select.team": "Equipa",
  "demoFlow.select.later": "Decidir mais tarde (fica disponível no histórico)",

  "demoFlow.done.title": "Análise concluída!",
  "demoFlow.done.body": "A sua partida foi processada e os seus dados estão prontos.",
  "demoFlow.done.player": "Jogador",
  "demoFlow.done.map": "Mapa",
  "demoFlow.done.status": "Estado",
  "demoFlow.done.statusValue": "Processada e associada ao seu perfil",
  "demoFlow.done.cta": "Ver a minha análise",
  "demoFlow.done.close": "Fechar",
  "demoFlow.done.autoClose": "Esta janela fecha-se sozinha em {seconds} s.",

  "demoFlow.failed.title": "A análise não foi concluída",
  "demoFlow.failed.retryHint":
    "Pode tentar novamente a partir do cartão desta demo no histórico, conforme as regras de nova tentativa.",
  "demoFlow.failed.selectAndRetry":
    "A partida foi lida, mas a etapa final falhou. Selecione o seu jogador para iniciar uma nova tentativa.",
  "demoFlow.cardAction.title": "Esta demo precisa de uma ação no histórico",
  "demoFlow.cardAction.reprocess":
    "Foi analisada por uma versão anterior do parser. Use o botão do cartão para a reprocessar com o parser atual.",
  "demoFlow.cardAction.reupload":
    "O ficheiro desta demo expirou. Envie o ficheiro novamente para a analisar.",
  "demoFlow.blocked.title": "Revisão necessária",
  "demoFlow.cancelRequested.title": "A cancelar a análise",
  "demoFlow.cancelled.title": "Análise cancelada",
  "demoFlow.unknown.title": "Estado desconhecido",
  "demoFlow.unknown.body":
    "Recebemos um estado que não reconhecemos. Nada foi considerado concluído; acompanhe esta demo pelo histórico.",

  "demoFlow.cancel": "Cancelar análise",
  "demoFlow.cancelConfirm": "Confirmar cancelamento",
  "demoFlow.cancelKeep": "Continuar a análise",
  "demoFlow.cancelQuestion":
    "Cancelar interrompe a análise desta demo. O histórico é mantido. Pretende cancelar?",
  "demoFlow.cancelError": "Não foi possível cancelar agora. A análise continua.",
  "demoFlow.background": "Continuar em segundo plano",
  "demoFlow.backgroundHint":
    "A análise continua no servidor; acompanhe-a pelo cartão no histórico.",
  "demoFlow.close": "Fechar",
  "demoFlow.reconnecting": "Sem ligação. A tentar voltar a ligar e retomar o acompanhamento…",
  "demoFlow.resumed": "Retomámos o acompanhamento desta demo.",
  "demoFlow.leaveWarning": "O envio da demo ainda está em curso. Sair agora interrompe o envio.",
};

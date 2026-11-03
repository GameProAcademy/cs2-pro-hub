/** Upload modal (envio, processamento e identificação do jogador). */
export const demoFlowPtBR = {
  "demoFlow.dialogLabel": "Análise da sua demo",
  "demoFlow.file": "Arquivo",
  "demoFlow.size": "Tamanho",
  "demoFlow.steps.label": "Etapas da análise",
  "demoFlow.step.upload": "Envio",
  "demoFlow.step.validate": "Validação",
  "demoFlow.step.read": "Leitura da partida",
  "demoFlow.step.metrics": "Métricas",
  "demoFlow.step.identify": "Identificação",
  "demoFlow.step.done": "Conclusão",
  "demoFlow.state.done": "concluída",
  "demoFlow.state.active": "em andamento",
  "demoFlow.state.pending": "aguardando",
  "demoFlow.state.error": "com erro",

  "demoFlow.upload.title": "Enviando sua demo",
  "demoFlow.upload.body": "Estamos enviando sua partida com segurança para iniciar a análise.",
  "demoFlow.upload.hashing": "Preparando o arquivo (verificando o conteúdo)…",
  "demoFlow.upload.registering": "Registrando o envio…",
  "demoFlow.upload.uploading": "Enviando o arquivo…",
  "demoFlow.upload.keepOpen":
    "Mantenha esta página aberta até o envio terminar. Depois disso, a análise continua no servidor.",
  "demoFlow.upload.failedTitle": "Não foi possível enviar a demo",
  "demoFlow.upload.tryAgain": "Escolher o arquivo novamente",
  "demoFlow.upload.interruptedTitle": "O envio foi interrompido",
  "demoFlow.upload.interruptedBody":
    "A página foi fechada ou recarregada enquanto o arquivo {file} era enviado, e o navegador não guarda o arquivo. Nenhuma análise foi iniciada para este envio. Escolha o mesmo arquivo novamente para enviar.",

  "demoFlow.validate.title": "Validando sua demo",
  "demoFlow.validate.body":
    "Estamos verificando o arquivo e preparando sua partida para processamento.",
  "demoFlow.validate.waitingJob": "Confirmando o recebimento da demo…",
  "demoFlow.validate.queued": "Sua demo está na fila de processamento.",
  "demoFlow.validate.validating": "Validando o arquivo da demo.",

  "demoFlow.read.title": "Lendo sua partida",
  "demoFlow.read.body": "Estamos analisando rounds, jogadores, eventos e informações da partida.",

  "demoFlow.metrics.title": "Calculando suas métricas",
  "demoFlow.metrics.body":
    "Estamos organizando os dados da partida e preparando seu perfil de desempenho.",
  "demoFlow.attaching.title": "Associando a partida ao seu jogador",
  "demoFlow.attaching.body":
    "Seu jogador foi confirmado. Estamos vinculando esta partida e as métricas ao seu perfil.",

  "demoFlow.identify.title": "Identificando seu jogador",
  "demoFlow.identify.body": "Estamos identificando seu perfil dentro desta partida.",
  "demoFlow.identify.loadError": "Não conseguimos carregar os jogadores desta partida.",
  "demoFlow.identify.reload": "Tentar carregar novamente",
  "demoFlow.identify.automaticTitle": "Encontramos você nesta partida",
  "demoFlow.identify.automaticBody":
    "Identificamos seu jogador pela conta Steam vinculada. Confirme para concluir a análise.",
  "demoFlow.identify.confirmAutomatic": "Sim, sou eu",
  "demoFlow.select.title": "Qual é o seu nickname nesta partida?",
  "demoFlow.select.body":
    "Encontramos vários jogadores ou não conseguimos confirmar automaticamente qual deles é você. Selecione seu nickname para associarmos corretamente suas estatísticas ao seu perfil.",
  "demoFlow.select.cta": "Confirmar meu jogador",
  "demoFlow.select.required": "Selecione um jogador para continuar.",
  "demoFlow.select.suggested": "Nickname do seu histórico",
  "demoFlow.select.team": "Time",
  "demoFlow.select.later": "Decidir depois (fica disponível no histórico)",

  "demoFlow.done.title": "Análise concluída!",
  "demoFlow.done.body": "Sua partida foi processada e seus dados estão prontos.",
  "demoFlow.done.player": "Jogador",
  "demoFlow.done.map": "Mapa",
  "demoFlow.done.status": "Status",
  "demoFlow.done.statusValue": "Processada e vinculada ao seu perfil",
  "demoFlow.done.cta": "Ver minha análise",
  "demoFlow.done.close": "Fechar",
  "demoFlow.done.autoClose": "Esta janela fecha sozinha em {seconds} s.",

  "demoFlow.failed.title": "A análise não foi concluída",
  "demoFlow.failed.retryHint":
    "Você pode tentar novamente pelo cartão desta demo no histórico, conforme as regras de nova tentativa.",
  "demoFlow.failed.selectAndRetry":
    "A partida foi lida, mas a etapa final falhou. Selecione seu jogador para iniciar uma nova tentativa.",
  "demoFlow.cardAction.title": "Esta demo precisa de uma ação no histórico",
  "demoFlow.cardAction.reprocess":
    "Ela foi analisada por uma versão anterior do parser. Use o botão do cartão para reprocessar com o parser atual.",
  "demoFlow.cardAction.reupload":
    "O arquivo desta demo expirou. Envie o arquivo novamente para analisá-la.",
  "demoFlow.blocked.title": "Revisão necessária",
  "demoFlow.cancelRequested.title": "Cancelando a análise",
  "demoFlow.cancelled.title": "Análise cancelada",
  "demoFlow.unknown.title": "Estado desconhecido",
  "demoFlow.unknown.body":
    "Recebemos um estado que não reconhecemos. Nada foi considerado concluído; acompanhe esta demo pelo histórico.",

  "demoFlow.cancel": "Cancelar análise",
  "demoFlow.cancelConfirm": "Confirmar cancelamento",
  "demoFlow.cancelKeep": "Continuar a análise",
  "demoFlow.cancelQuestion":
    "Cancelar interrompe a análise desta demo. O histórico é mantido. Deseja cancelar?",
  "demoFlow.cancelError": "Não foi possível cancelar agora. A análise continua.",
  "demoFlow.background": "Continuar em segundo plano",
  "demoFlow.backgroundHint":
    "A análise continua no servidor; você acompanha pelo cartão no histórico.",
  "demoFlow.close": "Fechar",
  "demoFlow.reconnecting": "Sem conexão. Tentando reconectar e retomar o acompanhamento…",
  "demoFlow.resumed": "Retomamos o acompanhamento desta demo.",
  "demoFlow.leaveWarning":
    "O envio da demo ainda está em andamento. Sair agora interrompe o envio.",
} as const;

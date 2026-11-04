/** Demo guidance: what happened and what to do (modal, card and problem report). */
export const guidancePtBR = {
  "guidance.whatToDo": "O que você deve fazer?",
  "guidance.reference": "Referência técnica",
  "guidance.action.retry": "Tentar novamente",
  "guidance.action.chooseAnother": "Enviar outra demo",
  "guidance.action.selectPlayer": "Selecionar meu jogador",
  "guidance.action.report": "Reportar problema",
  "guidance.action.understood": "Entendi",

  "guidance.processing.title": "Análise em andamento",
  "guidance.processing.body": "Sua demo está na fila ou sendo processada normalmente.",
  "guidance.processing.todo":
    "Você não precisa enviar novamente. Acompanhe o status por aqui; a análise continua no servidor.",
  "guidance.completed.title": "Análise concluída",
  "guidance.completed.body": "Sua partida foi processada e vinculada ao seu perfil.",
  "guidance.completed.todo": "Nada a fazer. Seus dados já aparecem nas suas análises.",
  "guidance.partial.title": "Análise concluída com limitações",
  "guidance.partial.body":
    "Sua partida foi processada, mas alguns dados não estavam disponíveis nesta demo. Só mostramos o que foi realmente medido.",
  "guidance.partial.todo":
    "Nada a fazer. As métricas indisponíveis ficam em branco, nunca como zero.",
  "guidance.identity_pending.title": "Aguardando identificação",
  "guidance.identity_pending.body":
    "Sua partida foi lida. Precisamos confirmar qual jogador é você antes de finalizar suas estatísticas.",
  "guidance.identity_pending.todo": "Selecione seu nickname para continuar a análise.",
  "guidance.invalid_file.title": "Não foi possível ler sua demo",
  "guidance.invalid_file.body":
    "Não conseguimos ler esta demo. O arquivo pode estar incompleto ou danificado.",
  "guidance.invalid_file.todo": "Escolha outra demo e tente novamente.",
  "guidance.incompatible_format.title": "Formato incompatível",
  "guidance.incompatible_format.body":
    "Este arquivo não está em um formato ou tamanho compatível com o CS2 PRO.",
  "guidance.incompatible_format.todo": "Selecione uma demo CS2 válida no formato .dem.",
  "guidance.insufficient_sample.title": "Partida curta demais",
  "guidance.insufficient_sample.body":
    "A demo é válida, mas tem poucos rounds utilizáveis para uma análise honesta.",
  "guidance.insufficient_sample.todo":
    "Envie outra demo, de uma partida mais longa. Enviar esta mesma demo de novo terá o mesmo resultado.",
  "guidance.temporary_failure.title": "Ocorreu uma falha temporária",
  "guidance.temporary_failure.body":
    "Nosso sistema encontrou uma falha temporária durante a análise. Sua demo continua registrada no histórico.",
  "guidance.temporary_failure.todo":
    "Não é necessário enviar a demo novamente. Tente novamente; se o problema continuar, reporte para a nossa equipe.",
  "guidance.service_issue.title": "Falha do nosso lado",
  "guidance.service_issue.body":
    "A análise parou por um problema no nosso serviço de análise, não no seu arquivo.",
  "guidance.service_issue.todo":
    "Não envie esta mesma demo novamente agora. Reporte o problema para a nossa equipe investigar.",
  "guidance.raw_audit_review.title": "Análise retida para revisão",
  "guidance.raw_audit_review.body":
    "Recebemos sua demo, mas alguns dados não passaram pelas verificações de segurança e integridade. Por segurança, não geramos as estatísticas desta partida.",
  "guidance.raw_audit_review.todo":
    "Não é necessário enviar esta mesma demo novamente. Nossa equipe precisa revisar o problema.",
  "guidance.canonical_review.title": "Validação dos dados não concluída",
  "guidance.canonical_review.body":
    "Não foi possível validar os dados necessários para gerar as estatísticas desta partida. Seus dados brutos foram preservados.",
  "guidance.canonical_review.todo":
    "Nossa equipe precisa verificar o motivo antes que a análise possa ser concluída. Não envie esta mesma demo novamente.",
  "guidance.quarantined.title": "Partida em revisão",
  "guidance.quarantined.body":
    "Esta partida está retida em revisão técnica e não pode ser processada novamente por enquanto.",
  "guidance.quarantined.todo": "Não envie esta mesma demo novamente. Reporte se precisar de ajuda.",
  "guidance.older_parser.title": "Analisada por uma versão anterior",
  "guidance.older_parser.body":
    "Esta demo foi analisada por uma versão anterior do nosso analisador.",
  "guidance.older_parser.todo":
    "Use “Reprocessar com o parser atual” no cartão desta demo. Não é preciso enviar o arquivo de novo.",
  "guidance.file_expired.title": "O arquivo desta demo expirou",
  "guidance.file_expired.body": "O arquivo guardado desta demo não está mais disponível.",
  "guidance.file_expired.todo": "Envie o arquivo novamente para analisá-lo.",
  "guidance.cancelled.title": "Análise cancelada",
  "guidance.cancelled.body": "A análise desta demo foi cancelada. O histórico foi mantido.",
  "guidance.cancelled.todo": "Se quiser analisá-la, envie a demo novamente.",
  "guidance.internal_error.title": "Ocorreu um problema inesperado",
  "guidance.internal_error.body": "Ocorreu um problema inesperado durante a análise.",
  "guidance.internal_error.todo":
    "Seu problema pode ser investigado pela nossa equipe. Envie um relatório para nos ajudar a identificar a causa.",
  "guidance.unknown.title": "Estado desconhecido",
  "guidance.unknown.body":
    "Recebemos um estado que não reconhecemos. Nada foi considerado concluído.",
  "guidance.unknown.todo": "Acompanhe esta demo pelo histórico ou reporte o problema.",

  "report.detailsLabel": "Conte mais detalhes (opcional)",
  "report.detailsPlaceholder": "O que você estava fazendo, o que esperava ver…",
  "report.privacy": "Não inclua senhas, tokens ou dados pessoais",
  "report.send": "Enviar relatório",
  "report.sending": "Enviando…",
  "report.cancel": "Cancelar",
  "report.sent":
    "Problema reportado com sucesso. Nossa equipe recebeu as informações necessárias para investigar.",
  "report.recorded":
    "Não conseguimos enviar seu relatório automaticamente. Seu problema foi registrado localmente no sistema e poderá ser enviado novamente.",
  "report.sendAgain": "Enviar novamente",
  "report.protocol": "Protocolo",
  "report.rateLimited":
    "Você enviou vários relatórios recentemente. Aguarde um pouco antes de enviar outro.",
  "report.notFound": "Não encontramos esta demo na sua conta.",
  "report.unavailable":
    "Não conseguimos registrar seu relatório agora. Tente novamente em instantes.",

  "pending.titleOne": "1 demo aguardando sua identificação",
  "pending.titleMany": "{count} demos aguardando sua identificação",
  "pending.body":
    "Suas partidas foram lidas. Selecione seu jogador para concluir as estatísticas; nada é perdido enquanto isso.",
  "pending.cta": "Identificar agora",
  "pending.navLabel": "{count} ações pendentes",
  "pending.unnamed": "Demo sem nome",
  "pending.more": "e mais {count}",
} as const;

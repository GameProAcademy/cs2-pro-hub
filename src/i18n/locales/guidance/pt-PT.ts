import type { guidancePtBR } from "./pt-BR";

export const guidancePtPT: Record<keyof typeof guidancePtBR, string> = {
  "guidance.whatToDo": "O que deve fazer?",
  "guidance.reference": "Referência técnica",
  "guidance.action.retry": "Tentar novamente",
  "guidance.action.chooseAnother": "Enviar outra demo",
  "guidance.action.selectPlayer": "Selecionar o meu jogador",
  "guidance.action.report": "Reportar problema",
  "guidance.action.understood": "Compreendi",

  "guidance.processing.title": "Análise em curso",
  "guidance.processing.body": "A sua demo está na fila ou a ser processada normalmente.",
  "guidance.processing.todo":
    "Não precisa de enviar novamente. Acompanhe o estado aqui; a análise continua no servidor.",
  "guidance.completed.title": "Análise concluída",
  "guidance.completed.body": "A sua partida foi processada e associada ao seu perfil.",
  "guidance.completed.todo": "Nada a fazer. Os seus dados já aparecem nas suas análises.",
  "guidance.partial.title": "Análise concluída com limitações",
  "guidance.partial.body":
    "A sua partida foi processada, mas alguns dados não estavam disponíveis nesta demo. Só mostramos o que foi realmente medido.",
  "guidance.partial.todo":
    "Nada a fazer. As métricas indisponíveis ficam em branco, nunca como zero.",
  "guidance.identity_pending.title": "A aguardar identificação",
  "guidance.identity_pending.body":
    "A sua partida foi lida. Precisamos de confirmar qual jogador é o seu antes de finalizar as suas estatísticas.",
  "guidance.identity_pending.todo": "Selecione o seu nickname para continuar a análise.",
  "guidance.invalid_file.title": "Não foi possível ler a sua demo",
  "guidance.invalid_file.body":
    "Não conseguimos ler esta demo. O ficheiro pode estar incompleto ou danificado.",
  "guidance.invalid_file.todo": "Escolha outra demo e tente novamente.",
  "guidance.incompatible_format.title": "Formato incompatível",
  "guidance.incompatible_format.body":
    "Este ficheiro não está num formato ou tamanho compatível com o CS2 PRO.",
  "guidance.incompatible_format.todo": "Selecione uma demo CS2 válida no formato .dem.",
  "guidance.insufficient_sample.title": "Partida demasiado curta",
  "guidance.insufficient_sample.body":
    "A demo é válida, mas tem poucas rondas utilizáveis para uma análise honesta.",
  "guidance.insufficient_sample.todo":
    "Envie outra demo, de uma partida mais longa. Enviar esta mesma demo novamente dará o mesmo resultado.",
  "guidance.temporary_failure.title": "Ocorreu uma falha temporária",
  "guidance.temporary_failure.body":
    "O nosso sistema encontrou uma falha temporária durante a análise. A sua demo continua registada no histórico.",
  "guidance.temporary_failure.todo":
    "Não é necessário enviar a demo novamente. Tente novamente; se o problema continuar, reporte à nossa equipa.",
  "guidance.service_issue.title": "Falha do nosso lado",
  "guidance.service_issue.body":
    "A análise parou por um problema no nosso serviço de análise, não no seu ficheiro.",
  "guidance.service_issue.todo":
    "Não envie esta mesma demo novamente por agora. Reporte o problema para a nossa equipa investigar.",
  "guidance.raw_audit_review.title": "Análise retida para revisão",
  "guidance.raw_audit_review.body":
    "Recebemos a sua demo, mas alguns dados não passaram nas verificações de segurança e integridade. Por segurança, não gerámos as estatísticas desta partida.",
  "guidance.raw_audit_review.todo":
    "Não é necessário enviar esta mesma demo novamente. A nossa equipa precisa de rever o problema.",
  "guidance.canonical_review.title": "Validação dos dados não concluída",
  "guidance.canonical_review.body":
    "Não foi possível validar os dados necessários para gerar as estatísticas desta partida. Os seus dados brutos foram preservados.",
  "guidance.canonical_review.todo":
    "A nossa equipa precisa de verificar o motivo antes de a análise poder ser concluída. Não envie esta mesma demo novamente.",
  "guidance.quarantined.title": "Partida em revisão",
  "guidance.quarantined.body":
    "Esta partida está retida em revisão técnica e não pode ser processada novamente por agora.",
  "guidance.quarantined.todo": "Não envie esta mesma demo novamente. Reporte se precisar de ajuda.",
  "guidance.older_parser.title": "Analisada por uma versão anterior",
  "guidance.older_parser.body":
    "Esta demo foi analisada por uma versão anterior do nosso analisador.",
  "guidance.older_parser.todo":
    "Use “Reprocessar com o parser atual” no cartão desta demo. Não é preciso enviar o ficheiro de novo.",
  "guidance.file_expired.title": "O ficheiro desta demo expirou",
  "guidance.file_expired.body": "O ficheiro guardado desta demo já não está disponível.",
  "guidance.file_expired.todo": "Envie o ficheiro novamente para o analisar.",
  "guidance.cancelled.title": "Análise cancelada",
  "guidance.cancelled.body": "A análise desta demo foi cancelada. O histórico foi mantido.",
  "guidance.cancelled.todo": "Se quiser analisá-la, envie a demo novamente.",
  "guidance.internal_error.title": "Ocorreu um problema inesperado",
  "guidance.internal_error.body": "Ocorreu um problema inesperado durante a análise.",
  "guidance.internal_error.todo":
    "O seu problema pode ser investigado pela nossa equipa. Envie um relatório para nos ajudar a identificar a causa.",
  "guidance.unknown.title": "Estado desconhecido",
  "guidance.unknown.body":
    "Recebemos um estado que não reconhecemos. Nada foi considerado concluído.",
  "guidance.unknown.todo": "Acompanhe esta demo pelo histórico ou reporte o problema.",

  "report.detailsLabel": "Conte-nos mais detalhes (opcional)",
  "report.detailsPlaceholder": "O que estava a fazer, o que esperava ver…",
  "report.privacy": "Não inclua palavras-passe, tokens ou dados pessoais",
  "report.send": "Enviar relatório",
  "report.sending": "A enviar…",
  "report.cancel": "Cancelar",
  "report.sent":
    "Problema reportado com sucesso. A nossa equipa recebeu as informações necessárias para investigar.",
  "report.recorded":
    "Não conseguimos enviar o seu relatório automaticamente. O seu problema foi registado no sistema e poderá ser enviado novamente.",
  "report.sendAgain": "Enviar novamente",
  "report.protocol": "Protocolo",
  "report.rateLimited":
    "Enviou vários relatórios recentemente. Aguarde um pouco antes de enviar outro.",
  "report.notFound": "Não encontrámos esta demo na sua conta.",
  "report.unavailable":
    "Não conseguimos registar o seu relatório agora. Tente novamente dentro de instantes.",
};

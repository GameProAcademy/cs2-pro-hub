# Correção cirúrgica do histórico de demos

## Objetivo
Fazer o histórico refletir fielmente o estado do backend já corrigido, sem alterar pipeline, dados, parser ou Railway.

## Alterações
- Remover somente o botão/link do estado vazio do histórico nas duas apresentações, mantendo o UploadBox principal e o CTA específico de demo corrompida.
- Diferenciar falha de consulta de histórico vazio: `listMyDemoJobs()` lançará erro quando a consulta de jobs ou de partidas falhar, e as telas exibirão erro em vez de estado vazio.
- Preservar todos os estados e tentativas históricas, incluindo relações de substituição.
- Ampliar o tipo de motivo de substituição para preservar `legacy_unvalidated` de ponta a ponta no servidor e no cliente.
- Adicionar testes de regressão para ausência do CTA no estado vazio, propagação dos erros e preservação do novo motivo.
- Atualizar o roadmap com o status honesto desta correção, sem encerrar a Fase 2.7.2.

## Validação
- Executar testes focados e a suíte existente relevante.
- Validar TypeScript e integridade do diff.
- Confirmar que nenhum dado ou migration foi alterado.

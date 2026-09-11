# Gate 02 — preparar o primeiro E2E real

## Resultado esperado

Deixar o fluxo oficial pronto para uma única demo real e manter o Gate 02 como **BLOCKED** enquanto nenhum arquivo `.dem` real estiver disponível.

## Implementação

- Reutilizar o probe existente de `/health` e `/version` no processamento do job antes de gerar a URL assinada e chamar `/v1/parse`.
- Bloquear o processamento com a classificação já existente quando saúde, identidade, revisão ou contrato não coincidirem.
- Preservar a revisão esperada `git:c1a87f68ccf84e99b3a8ae07133b4a686669d814`, já presente como fallback imutável no APP; não alterar tokens ou outros segredos.
- Adicionar testes focados somente para o bloqueio preflight, sem alterar parser, engine canônico, integrações ou interface.
- Atualizar o roadmap com o estado objetivo do Gate 1E.1 e do Gate 02.

## Validação

- Executar os testes do worker e os testes do APP pelos scripts existentes.
- Executar lint e build; usar `tsgo` diretamente para validação de tipos, pois não existe script `typecheck`.
- Confirmar novamente que nenhum `.dem` real foi disponibilizado e não criar fixture ou substituto.

## Limite desta execução

Sem um `.dem` real fornecido ao upload oficial do produto, não haverá TUS, Storage, job, parse, CanonicalMatch ou persistência real. O relatório final marcará o Gate 02 como **BLOCKED** e indicará exatamente onde anexar o arquivo para continuar.

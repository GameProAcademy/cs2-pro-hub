# Plano — R5.6: staging real, transporte verificável e hardening final

## Resultado esperado

Concluir a infraestrutura R5.6 sem executar parser, Python, WASM, Railway, Attempt 9/10+, RAW, Canonical ou cleanup. Como o DEM físico não foi anexado, o resultado operacional máximo será `READY_FOR_REAL_DEM_STAGING`, com toda prova dependente dos bytes marcada `NOT_RUN` ou `NOT_AVAILABLE`.

## 1. Preservar identidade, histórico e baseline

- Manter o commit-base e a migration aplicada `20260923023058`; não recriar `20260923020200`, não editar migrations históricas e não alterar manualmente o registro de migrations.
- Confirmar no código ativo a identidade única: filename, 473.748.061 bytes, SHA-256 de 64 caracteres, release, bucket privado e path relativo exatos.
- Registrar snapshots reais antes/depois: staging/Storage, Attempt 9/10+, jobs/fila, Canonical 105/0/0/0, provenance e nonces.

## 2. Fechar o lifecycle de transporte

- Adicionar migration estritamente aditiva para transições atômicas de progresso, cancelamento e verificação, sem estado paralelo e sem apagar histórico.
- Preservar advisory lock, unicidade de staging ativo/READY, expiração fail-closed e bloqueio quando objeto expirado permanece no path.
- Garantir que cancelamento mantenha o upload retomável, registre `R5_UPLOAD_CANCELLED` e nunca marque completed, verified ou READY.
- Atualizar bytes enviados de forma monotônica e registrar timestamps/contadores mínimos sem armazenar conteúdo, URLs assinadas ou credenciais.

## 3. Fortalecer hash, TUS e resume

- Fazer o Worker retornar SHA e tamanho locais observados, com cancelamento e encerramento em todos os caminhos, mantendo leitura por `File.slice()` em memória limitada.
- Preservar TUS em chunks de 6 MiB, retries 0/3/5/10/20s, `x-upsert=false`, progresso, velocidade e ETA.
- Validar resume pela identidade completa e reportar se uma retomada real ocorreu; rejeitar metadata incompleta ou cruzada.
- Fazer a tela guardar e exibir o SHA/tamanho realmente calculados, sem substituir por constantes esperadas.

## 4. Endurecer verificação independente e gates

- Tornar o início, sucesso e falha da verificação transições atômicas; toda falha deve terminar em `BLOCKED` com código seguro.
- Manter leitura server-side por signed URL + `fetch()` + stream incremental, sem download integral nem `arrayBuffer()` do objeto.
- Comparar separadamente SHA/tamanho local e observado no servidor; READY somente após bytes físicos válidos e gate completo.
- Executar preflight fail-closed antes de criar staging: ausência de attempts/jobs/fila, baseline Canonical intacto, bucket privado, path/policies/constraints corretos e ausência de objeto conflitante.

## 5. Auditoria e interface administrativa

- Padronizar eventos `R5_STAGING_CREATED`, upload start/progress/completed/cancelled/failed, verify start/completed/failed e gate ready/blocked.
- Incluir somente timestamp, staging ID, resultado e metadados seguros necessários.
- Atualizar o painel R5.6 para separar hash local, upload, resume/cancelamento, verificação servidor e gate, mantendo explícito que nenhuma execução forense é iniciada.

## 6. Testes, banco real e relatório final

- Expandir contratos para migration efetiva, cancelamento retomável, progresso monotônico, resume estrito, hash local observado, transições de verificação e gates fail-closed.
- Executar testes R5, suíte local, checagem de tipos e lint; tratar CI externo separadamente e sem inventar resultado.
- Validar o schema e baseline no banco real após a migration, sem criar staging ou objeto quando o DEM não estiver disponível.
- Atualizar roadmap e produzir relatório R5.6 nas seções A–U com estados objetivos (`PASS`, `BLOCKED`, `NOT_RUN`, `IMPLEMENTED`, etc.).

## Limites mantidos

- Não criar fixture ou arquivo substituto.
- Não iniciar upload sem o DEM físico autorizado selecionado pelo Master Admin.
- Não executar R5.7, parser, Python/WASM, parity, determinism, tick authority, Railway, Attempt 9/10+, RAW, Canonical ou cleanup.

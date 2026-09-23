# Plano — R5.5: identidade canônica, transporte e prontidão de staging

## Resultado esperado

Concluir a R5.5 em `READY_FOR_REAL_DEM_STAGING`, com o Admin R5 pronto para receber o arquivo físico autorizado. Sem o arquivo selecionado manualmente, manter `r5_real_dem_access_gate(NULL) = NOT_READY` com `R5_DEM_NOT_STAGED` e declarar `REAL DEM NOT STAGED — NO EXECUTION PERFORMED.`

## 1. Preservar a fonte de verdade

- Confirmar o checkout no commit `ac31025844548729291fd4cd0458e0d6f5f36cdf` e preservar as correções mais recentes já presentes.
- Manter somente a migration oficial `20260923020200_r5_authorized_dem_sha_correction.sql`; não recriar a migration removida `20260923020100` e não editar migrations históricas aplicadas.
- Auditar código R5 ativo para garantir SHA canônico de 64 caracteres, filename, tamanho, release, bucket e path relativo exatos.

## 2. Aplicar e validar a correção no banco real

- Aplicar de verdade a migration `20260923020200_r5_authorized_dem_sha_correction.sql` pelo fluxo de migrations do projeto.
- Confirmar a versão `20260923020200` no histórico real, sem inserir histórico manualmente.
- Validar constraints, RLS, grants e todas as policies do bucket/path: acesso restrito a `service_role` e Master Admin, sem acesso público, genérico ou DELETE desnecessário.
- Comparar antes/depois: staging e objetos vazios, Attempt 9/10+ em zero e Canonical em `105 / 0 / 0 / 0`. Interromper se o baseline mudar.

## 3. Corrigir o lifecycle de staging expirado

- Criar uma migration aditiva para permitir histórico de múltiplos stagings da mesma identidade, removendo apenas a unicidade que impede um novo UUID após expiração.
- Manter identidade e `expires_at` imutáveis em cada registro, proibir DELETE destrutivo e impedir dois registros `READY_FOR_EXECUTION` simultâneos para a mesma identidade.
- Fazer a preparação reutilizar somente um staging ativo válido; marcar expirados de forma atômica e criar novo UUID apenas por ação real do Master Admin.
- Fazer consultas retornarem deterministicamente o staging ativo/mais recente, sem ambiguidade quando houver histórico.
- Se um objeto expirado ainda ocupar o path fixo, bloquear a nova transmissão com motivo explícito; não sobrescrever nem limpar silenciosamente.

## 4. Fortalecer transporte, resume e cancelamento

- Preservar TUS, chunks de 6 MiB, retries `0/3/5/10/20s`, progresso, velocidade, ETA e `x-upsert=false`.
- Vincular fingerprint e candidato de resume a release, SHA, filename, tamanho, bucket, path e content type; rejeitar resume cruzado ou metadata incompleta.
- Registrar progresso mínimo e transições por RPC atômica, sem considerar upload parcial ou upload concluído como verificado.
- Tratar cancelamento como estado auditável e recuperável, nunca como READY, mantendo retry/resume legítimo e sem apagar histórico.

## 5. Mover o hash local para Web Worker

- Criar um Worker dedicado para SHA-256 incremental com `file.slice()` e chunks bounded-memory.
- Trocar com a tela apenas mensagens de progresso, conclusão, cancelamento e erro; nunca duplicar/carregar o arquivo inteiro.
- Preservar cancelamento via `AbortSignal` e finalizar o Worker em todos os caminhos.
- Manter a verificação server-side por signed URL + `fetch()` + `response.body.getReader()`, sem `storage.download()`, `response.arrayBuffer()` ou retorno dos bytes ao cliente.

## 6. Completar auditoria e Admin R5

- Padronizar os eventos exigidos: criação, início/progresso/conclusão/falha do upload, início/conclusão/falha da verificação e gate bloqueado/pronto, apenas com metadados mínimos.
- Exibir filename, tamanho, SHA, bucket, object path, hash local, progresso, velocidade, ETA, bytes enviados/totais, estado TUS, estado server-side, hash/tamanho observados, gate e blockers.
- Mostrar claramente `Waiting for physical authorized DEM upload.` quando nenhum arquivo real tiver sido enviado.
- Separar visualmente `UPLOAD COMPLETED`, `DEM VERIFIED` e `READY_FOR_EXECUTION`; nenhuma ação da tela inicia parser ou Attempt 9.

## 7. Testes e provas finais

- Expandir os contratos para SHA exato/regex/64 chars, ausência do SHA antigo no código ativo, path relativo, policies, lifecycle expirado, unicidade de READY, Worker bounded-memory, TUS metadata/resume/cancel, streaming server-side e gates fail-closed.
- Executar testes R5 focados, harness PostgreSQL de concorrência, checagem de tipos e validações estáticas disponíveis.
- Consultar o banco real após as mudanças: histórico de migration, rows/objects, policies/RLS, gate R5, `pre_attempt_9_gate_status(NULL)`, attempts, jobs/fila e baseline Canonical.
- Atualizar roadmap, relatório técnico R5.5 e artefato machine-readable com os 30 itens obrigatórios, distinguindo implementação de execução comprovada.

## Restrições mantidas

- Não executar parser Python/WASM/Railway, R5.3, Attempt 9/10+, Canonical promotion, cleanup, deploy ou alteração de Railway/secrets.
- Não criar fixture, staging, objeto, nonce, HMAC, OIDC ou provenance falsos.
- HMAC, OIDC e provenance permanecem blockers não verificados.
- O estado máximo sem upload físico é `READY_FOR_REAL_DEM_STAGING`; `READY_FOR_EXECUTION` só pode resultar da leitura e validação real dos bytes no Storage.

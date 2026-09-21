# FASE 2.7.2G.6 — retenção e deleção física segura de DEM

## Estado auditado

- Há `1` job `blocked_raw_audit` sem retenção e com objeto físico; `6` jobs `failed` sem retenção.
- Há `4` jobs marcados como deletados; `3` deles ainda possuem objeto físico (`DELETION_METADATA_MISMATCH`).
- O bucket privado `demos` contém `9` objetos e cerca de `3,79 GB`; há `1` órfão de `1.024 bytes`.
- O cleanup atual seleciona apenas por data + marcador nulo, remove o objeto e marca sucesso sem confirmar ausência física.
- Falha terminal durável, bloqueio RAW e recuperação stale terminal não iniciam corretamente a janela de 72h.
- Retry e cancelamento não compartilham um claim transacional com o cleanup.
- As funções privilegiadas auditadas já são restritas ao serviço e usam `search_path` seguro; isso será preservado.

## Implementação

1. **Contrato único de retenção**
   - Versionar `demo-retention-v1` e manter 24h para sucesso, 72h para falha terminal/RAW bloqueado e elegibilidade imediata para cancelamento seguro.
   - Definir a retenção a partir do término terminal, nunca da criação.
   - Limpar retenção e qualquer claim de cleanup quando um retry realmente reativar o mesmo objeto.

2. **Migration incremental e preservadora**
   - Adicionar somente metadados necessários de tentativa, claim, verificação, motivo e política de cleanup em `demo_jobs`.
   - Criar RPCs service-role-only para reivindicar candidatos, finalizar deleção verificada, registrar falha e produzir métricas/classificação de órfãos.
   - Centralizar o safety gate no banco com lock por job e validações de estado terminal, upload/path/ownership, lease, worker, retry/fila, RAW e Canonical quando aplicáveis.
   - Atualizar todos os caminhos terminais: processed, failed durável/local, stale terminal, blocked RAW e cancelled.
   - Fazer backfill somente de `failed`/`blocked_raw_audit` sem retenção, sem apagar ou reescrever histórico.

3. **Deleção física verificada no servidor**
   - Validar estritamente `{user_id}/{upload_id}.dem` e o bucket fixo `demos`.
   - Distinguir `ALREADY_ABSENT`, `DELETE_VERIFIED`, `DELETE_FAILED` e `DELETE_NOT_VERIFIED`.
   - Consultar existência antes, remover quando presente e consultar novamente; só então registrar `storage_deleted_at`/verificação.
   - Processar candidatos isoladamente para uma falha não abortar os demais.

4. **Concorrência, mismatch e órfãos**
   - Usar claim com expiração e bloqueio de linha para serializar duas limpezas sem bloquear o pipeline inteiro.
   - Fazer retry e cleanup disputarem o mesmo estado: retry anterior invalida elegibilidade; cleanup já reivindicado impede reativação até conclusão/expiração.
   - Reexaminar também jobs já marcados como deletados para detectar objeto ainda presente e corrigir pelo fluxo verificado.
   - Classificar objetos sem job/upload com janela conservadora e relatório de contagem/bytes; não apagá-los automaticamente nesta fase sem prova histórica suficiente.

5. **Testes e documentação**
   - Cobrir a matriz A–Q com testes unitários/contratuais: retenções, estados ativos, cancelamento, falhas de delete, ausência idempotente, concorrência, retry×cleanup, mismatch, órfão, preservação histórica, SHA e ACL.
   - Atualizar os três documentos exigidos e o roadmap com as subfases G.6-A–J e métricas reais pós-migration.
   - Executar typecheck, Vitest completo e focado, lint, Prettier check, diff check, compileall e testes Python disponíveis.

## Limites mantidos

- Nenhuma DEM real, Cache Run, tentativa 9, escrita/abertura de Canonical, mudança de Railway, segredo, parser/browser-WASM ou histórico derivado.
- Nenhum delete direto em `storage.objects`; remoção física somente pela API de Storage e com verificação posterior.
- O objeto órfão e objetos históricos não serão apagados sem o safety gate e prova suficiente.

## Gate final

`DEM_RETENTION_POLICY = PASS` somente se migration, backfill, safety gate, deleção verificada, mismatch, concorrência e testes passarem. Caso qualquer prova falhe, o resultado será `PARTIAL` com gaps e contagens exatas; `REAL_DEM_EXECUTION`, paridade e determinismo permanecem `NOT_RUN`, e Canonical/AI continuam bloqueados.

# FASE 2.7.2D.4-B.1 — Contract hardening e alinhamento RAW/HOT

## Objetivo
Endurecer o fluxo durable já existente sem alterar sua arquitetura: RAW permanece como artifact imutável em Storage, HOT permanece limitado e sem RAW, e Canonical recebe apenas fatos semânticos aprovados.

## Implementação
1. **Separar tentativas técnicas e lógicas**
   - Preservar `dispatch_attempt` apenas para claim, lease, heartbeat e fila.
   - Usar `demo_jobs.attempt_number` para identidade, prefixo, manifest, referência, auditoria e verificação do RAW Artifact.
   - Garantir retry técnico no mesmo artifact e nova tentativa lógica em novo prefixo/artifact.

2. **Endurecer contrato HOT**
   - Aceitar eventos não classificados como cobertura parcial declarada, mantendo-os somente no RAW.
   - Validar qualidade e overflow de todas as seções, rejeitando inconsistências e truncamento silencioso.
   - Marcar AIM, position e economy como `not_implemented` sem fabricar dados ou bloquear por si só.

3. **Alinhar limites durable**
   - Definir alvo de 4 MiB e hard maximum de 8 MiB para o payload completo `{ hot, raw }`.
   - Aplicar o mesmo limite no worker, bridge e `/complete`, com falha explícita acima do máximo.

4. **Fortalecer RAW Artifact**
   - Tornar READY logicamente imutável e permitir continuação idempotente apenas em uploading/verifying.
   - Validar identidade completa contra o job real, manifest, ordem de seções, chunks verificados, hash físico gzip, hash chain, section digests e root digest.
   - Preservar artifacts históricos e rejeitar conflitos durante retry parcial.

5. **Testes e documentação**
   - Cobrir attempts divergentes, retry técnico/lógico, eventos não classificados, limites/overflow, seções não implementadas, payload 8 MiB, identidade, manifest, tamper de chunk/root, READY imutável e retry parcial.
   - Executar regressões de durable dispatch, parser, RAW/HOT, Canonical, lifecycle, progress, feedback e idempotência.
   - Atualizar documentação e roadmap, mantendo Railway sync/deploy e E2E real explicitamente pendentes.

## Restrições
- Sem demo real, novo processamento, alteração de secrets ou deploy Railway.
- Sem banco externo, recriação/drop de tabelas, exclusão de histórico ou mudança destrutiva.
- Sem retorno ao RAW gigante por HTTP/JSONB e sem migration fictícia de histórico.

## Critérios de conclusão
- Tentativa técnica e lógica separadas em todo o caminho durable.
- HOT parcial é aceito quando declarado; contrato estrutural/integridade continua fail-closed.
- Payload durable tem target de 4 MiB e hard maximum de 8 MiB.
- RAW READY é imutável, retries são idempotentes e hashes/manifests são determinísticos.
- Testes novos e regressões relevantes passam; E2E real e Railway permanecem pendentes.

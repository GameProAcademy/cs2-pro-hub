# Fechamento seguro do controlled replay e gate do Attempt 9

## Objetivo
Fechar as lacunas que ainda permitem ambiguidade ou um Attempt 10, sem iniciar o replay real enquanto provenance, identidade, fonte e estado do banco não estiverem integralmente verificados.

## Implementação
- Criar migration incremental com uma RPC exclusiva `reserve_controlled_demo_replay_attempt_9`.
- Serializar por usuário + SHA com advisory transaction lock, validar integralmente o Attempt 8 e criar exatamente o Attempt 9.
- Tornar a reserva idempotente: reutilizar somente um Attempt 9 compatível; bloquear estados incompatíveis e qualquer Attempt acima de 9.
- Ampliar, sem reescrever histórico, os checks de `replacement_reason` para `g6r-real-demo-replay`.
- Adicionar defesa de banco contra Attempt maior que 9 quando a razão for o replay controlado.
- Registrar e validar provenance em estrutura autoritativa, service-role-only, com branch/deployment/commit/identidade/hashes e status `VERIFIED`.
- Fazer o fluxo administrativo exigir provenance verificada, identidade exata, reserva exclusiva, cópia server-side verificada e enqueue oficial.
- Validar integralmente o retorno do enqueue, inclusive upload, status, supersession e motivo.
- Registrar estados parciais de forma observável para que falhas após reserva/cópia/enqueue não sejam reportadas de modo enganoso.

## Validação
- Testar identidade, build, provenance, constraints, reserva 9, bloqueio do 10, concorrência, idempotência, cópia, SHA/tamanho, preservação da fonte, enqueue, RAW/Canonical/projeções e isolamento de retenção.
- Aplicar a migration e verificar suas ACLs e comportamento no banco real.
- Executar preflight read-only completo imediatamente antes de qualquer mutação.
- Se qualquer gate estiver incompleto ou divergente, encerrar como `BLOCKED_BEFORE_ATTEMPT_9`, sem criar/copy/enqueue/retry.
- Somente com todos os gates PASS, criar o Attempt 9 e observar o E2E real até o estado terminal, sem tentativa automática e sem Attempt 10.

## Fora de escopo
- Nenhuma alteração ou publicação no Railway, parser, branch, Dockerfile, versão ou contrato.
- Nenhum cleanup físico, alteração do RAW do Attempt 8, sobrescrita da DEM fonte ou liberação antecipada de Canonical/AI Coach.

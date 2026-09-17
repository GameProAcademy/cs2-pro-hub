# FASE 2.7.2D.5-A — Claim hardening, JSON estrito e E2E Cache

## Objetivo
Remover o bloqueio de serialização causado por números não finitos no RAW, preservar o contrato durable claim já aplicado e continuar somente o job Cache existente até evidência terminal real.

## Implementação
- Manter o RPC incremental atual, confirmando no banco que `user_id` e `attempt_number` vêm do job e que `attempt` continua sendo a tentativa de dispatch.
- Adicionar normalização recursiva e determinística na fronteira `_stable()` do RAW: `NaN`, `Infinity` e `-Infinity` viram `null`; demais valores permanecem inalterados.
- Preservar `allow_nan=False`, ordenação estável, gzip `mtime=0`, hash dos bytes comprimidos, chunking 4/8 MiB e o caminho por `attempt_number`.
- Ampliar testes para escalares, listas, estruturas aninhadas, tipos preservados, determinismo, serialização estrita e tick realista.
- Validar reutilização idempotente dos chunks verificados e conflito explícito de hash, sem apagar chunks parciais.

## Validação e operação
- Executar testes focados e completos do APP e parser, typecheck, compileall e Docker apenas se disponível.
- Publicar o APP; não alterar nem publicar Railway nesta fase.
- Inspecionar o estado live antes de qualquer ação e usar somente recovery/reconciliation oficial se o mesmo job Cache estiver elegível.
- Acompanhar claim, parser isolado, todas as seções RAW, chunks, artifact READY, digest, HOT, `/complete`, auditoria, Canonical, métricas, features, fila, job e upload.
- Não criar upload, fixture ou mensagem duplicada; não resetar tentativas, apagar dados, alterar secrets ou forçar estado.

## Critério de fechamento
Marcar PASS somente com evidência real de conclusão de todos os gates. Se o E2E parar, registrar exatamente o último gate comprovado e o bloqueio restante.

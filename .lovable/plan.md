# R5.2-C → R5.3-PREP: correção e validação forense

## Objetivo
Concluir a correção do caminho relativo ao bucket, validar o transporte TUS e preparar a prontidão forense sem executar parser, Attempt 9, Canonical, Railway ou cleanup.

## Implementação
- Confirmar e preservar a convenção única: bucket `r5-forensic-staging` + objeto relativo `cf0549c2-dfbd-c4df-25b4-2ce8204edf87/0caa7c9744deec106095895d2dacd19cbfdae689f99e29b00dd4d446b4ec8ae3d.dem`.
- Aplicar a migration de correção no banco real e auditar constraint, policies, bucket privado, limite, funções e baseline sem contaminação.
- Reforçar a máquina de estados no banco para impedir transições prematuras, regressões e concorrência insegura; manter `READY_FOR_EXECUTION` separado de autorização de execução.
- Fortalecer a retomada TUS para selecionar somente uploads cujo fingerprint, tamanho, bucket e caminho sejam compatíveis, preservando chunks, retry, cancelamento e `x-upsert: false`.
- Manter precheck local incremental e verificação server-side streaming; completar testes de nome, tamanho, SHA, caminho, duplicidade, isolamento e estados.
- Atualizar relatórios machine-readable separando `IMPLEMENTED`, `EXECUTED`, `VERIFIED`, `NOT_RUN`, `NOT_VERIFIED` e `BLOCKED`.

## Validação operacional
- Verificar banco e Storage reais antes do upload: zero staging/objetos R5, Attempt 9/10+ zero, Canonical 105/0/0/0, provenance e nonces zero.
- Se o DEM real não estiver disponível no painel, não simular o upload: registrar `BLOCKED_REAL_DEM_NOT_STAGED` e `RESUME_RUNTIME_NOT_VERIFIED`.
- Se os bytes reais estiverem disponíveis pela interação administrativa, limitar a ação a upload TUS e verificação física; parar em `READY_FOR_EXECUTION` ou `BLOCKED`.
- Executar contratos focados, typecheck, lint aplicável, validação da migration, diff check e confirmar o build observado.

## Travas
- Nenhum parser Python/WASM, parity, determinism, tick authority, RAW execution evidence ou pipeline normal.
- Nenhum Attempt 9/10+, promoção/persistência Canonical, mutation Railway/secrets, cleanup ou evidência fabricada.
- `assert_attempt_9_authorized` permanece bloqueado e inacessível.

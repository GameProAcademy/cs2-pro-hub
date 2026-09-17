# Fase consolidada 2.7.2F.1 → 2.7.2F final

## Objetivo
Fechar definitivamente identidade, `participantKey`, dados semânticos player-scoped, retry/lifecycle e gates E2E, preservando parser contract `1`, revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`, RAW integral, HOT compacto e o job Cache existente.

## Estado auditado
- O resolvedor central `resolveAnalyticalParticipant()` já separa `participantKey`, chave de correlação e Steam opcional; métricas e features usam o participante resolvido.
- AIM, POSITION e ECONOMY já têm seleção player-scoped e estados de disponibilidade; utility ainda precisa declarar disponibilidade por jogador, não pelo match inteiro.
- `retryMyDemoJob()` e `runDemoE2E()` já usam a RPC única `retry_demo_job`; a RPC preserva `attempt_number`, incrementa dispatch/retry e é restrita ao `service_role`.
- Lacuna crítica: `runDemoE2E()` relê o job imediatamente após o requeue; não aguarda a execução real terminar.
- Lacuna crítica: a idempotência atual compara o estado anterior com somente uma execução, sem provar duas execuções reais completas.
- O Cache não pode ser executado antes de `/health` e `/version` comprovarem exatamente contrato e revisão; sem isso permanece `BLOCKED`.

## Implementação

### 1. Fechar participantKey e dados player-scoped
- Manter um único resolvedor analítico e remover nomenclaturas internas que ainda tratem a chave de evento como Steam por definição.
- Garantir participante sem Steam válido para operações compatíveis e falha fechada quando a correlação exigida não existe.
- Tornar utility availability específica do participante selecionado.
- Completar testes comportamentais para `participantKey != steamId`, Steam nula, participante inexistente e isolamento entre jogadores.

### 2. Fechar matriz AIM / POSITION / ECONOMY / UTILITY
- Preservar RAW, HOT, limites, serialização segura e cadeia de hashes sem mudanças de contrato.
- Cobrir `complete` / `limited` / `unavailable` e NULL ≠ zero para cada classe.
- Distinguir eventos de granada de pontos de trajetória; trajetórias continuam somente no RAW.
- Persistir apenas contagens/availability player-scoped na projeção existente, sem criar engine paralela.

### 3. Corrigir espera do E2E
- Extrair um polling testável com timeout finito, intervalo controlado e estados explícitos.
- Após `retry_demo_job`, aguardar transição real pela fila/worker até `processed` ou `failed`.
- Retornar `BLOCKED` para timeout, lease/heartbeat estagnado ou worker indisponível; retornar `FAIL` somente após execução terminal contraditória.
- Não chamar `processJob()` diretamente e não fazer update direto de status.

### 4. Provar idempotência real
- Registrar evidência terminal da Run 1.
- Solicitar Run 2 exclusivamente pela mesma RPC oficial, aguardar novo ciclo real e só então comparar evidências.
- Comparar Canonical, source, participants, rounds, round players, events, metrics, features, identidade e nickname provenance sem depender apenas de UUIDs internos.
- Nunca considerar duas leituras como duas execuções.

### 5. Segurança e testes
- Preservar ownership, master-admin, audit log, bucket privado, signed URLs e secrets somente no servidor.
- Adicionar testes comportamentais de polling, timeout, worker mismatch, terminal failure, execução processada, ausência de chamada direta e idempotência em duas runs.
- Executar testes focados e completos do APP, suíte Python parser/RAW/HOT, typecheck, compile e build; executar auditoria de segurança relevante.

### 6. Documentação e Cache real
- Atualizar a documentação com participantKey, identidades externas, NULL/availability, RAW/HOT, retry, attempts/dispatch, espera E2E e idempotência.
- Fazer preflight real de `/health` e `/version`.
- Executar exclusivamente o job/upload Cache reservado apenas se todos os gates anteriores estiverem PASS e a identidade Railway for exata.
- Se qualquer precondição falhar, não reenfileirar e registrar Cache Run 1, Run 2 e idempotência como `BLOCKED` ou `NOT_RUN` conforme a evidência.
- Encerrar com matriz G1–G22 usando somente `PASS`, `FAIL`, `BLOCKED` ou `NOT_RUN`; não iniciar a Fase 2.8.

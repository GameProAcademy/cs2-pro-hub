# Fase 2.7.2F — Player Identity + Player Data Integrity Closure

## Objetivo
Fechar identidade, métricas player-scoped, integridade AIM/POSITION/ECONOMY/UTILITY e lifecycle E2E sem alterar o contrato do parser, reduzir RAW, criar integrações fictícias ou declarar a demo Cache aprovada sem prova real.

## Estado auditado
- O domínio de identidade já separa método, fonte, confiança e confirmação; possui decisão append-only, proteção stale/idempotente, seleção manual e histórico de nicknames.
- A propagação do alvo já carrega `participantKey` e Steam opcional, mas o motor legado ainda faz `const steamId = participantKey`; rounds, eventos e economia continuam indexados conceitualmente pela identidade externa.
- O normalizer v1 ainda deriva a chave local de `steam_id`; o adapter canônico já distingue `participantKey` de `steamId64`, permitindo correção retrocompatível sem mudar o contrato 1.
- HOT preserva AIM, posição e economia separadamente; RAW permanece em chunks JSONL gzip com hashes, chain, manifest e root digest. Falta uma matriz formal e testes de escopo/ausência para as quatro classes semânticas.
- O runner administrativo ainda rearma jobs terminais por atualização direta de status/stage; isso é um caminho paralelo ao lifecycle oficial e impede F3 PASS.
- O job Cache reservado continua terminal e bloqueado. Nenhum requeue, nova tentativa, alteração de dados ou execução será feito antes de preflight Railway, lifecycle oficial e auditoria RAW estarem válidos.

## Implementação

### 1. Consolidar identidade sem duplicação
- Reutilizar o resolvedor, as tabelas e RPCs atuais; não criar engine ou tabela paralela.
- Completar testes de Steam automática, confirmação, rejeição, seleção manual sem Steam, Steam ausente, conflito, nickname exato/ambíguo/inexistente, ações duplicadas e corrida stale.
- Garantir que nickname continue apenas evidência contextual e que provenance seja reconstruível pelo event log, sem sobrescrever o histórico agregado.
- Ajustar somente lacunas reais de UX: método, fonte, confiança, equipe, participant key e estado persistido, mantendo cinco idiomas, mobile e acessibilidade.

### 2. Separar participante de identidade externa no caminho analítico
- Criar uma resolução central do alvo analítico: `participantKey` obrigatório; `steamId` e demais identidades externas opcionais.
- Fazer `computeMetrics()` localizar primeiro o participante pela `participantKey` e usar os identificadores de evento/round associados a ele, sem assumir igualdade global com Steam.
- Manter compatibilidade do parser v1, onde a coincidência pode existir no adapter, mas provar em testes `participantKey != steamId` e participante sem Steam.
- Propagar o mesmo alvo para Canonical, métricas, features e persistência; impedir associação ou projeção em estados unresolved/conflict/pending.
- Preservar NULL como desconhecido e zero apenas como observação comprovada em rounds, survival, KAST, opening, trades, dano, utility e economia.

### 3. Fechar AIM, POSITION, ECONOMY e UTILITY
- Formalizar uma única matriz de disponibilidade com fonte RAW, campo HOT, representação canônica, escopo do participante, requisito de métrica, condição NULL e qualidade.
- Adicionar filtros/seletores player-scoped para snapshots AIM, posição e economia e para eventos utility; nenhuma evidência de outro participante pode atravessar.
- Preservar todas as trajetórias no RAW; manter HOT limitado e Canonical sem volumetria forense.
- Distinguir eventos de granada de pontos de trajetória e manter ausência/partial/limited explícitos, sem converter ausência em zero.
- Cobrir por testes presença, ausência, partial coverage e isolamento entre jogadores.

### 4. Corrigir o lifecycle do E2E administrativo
- Remover o reset direto de job terminal do runner e reutilizar o mecanismo oficial existente de retry/replacement/requeue, preservando `attempt_number`, `dispatch_attempt`, `retry_count`, fila, lease, heartbeat e histórico.
- Manter verificação master-admin, ownership, audit log e ausência de tokens/URLs privadas.
- Basear o veredito no estado posterior do banco: job, parser, RAW, Canonical, participantes, rounds, eventos, métricas, features, identidade e histórico.
- Fortalecer a prova de idempotência por equivalência semântica, sem depender de UUIDs internos.

### 5. Validação e documentação
- Executar testes TS focados e completos, typecheck, suíte Python parser/RAW/HOT, build e checks de segurança aplicáveis.
- Atualizar a documentação técnica com identidade, participant key, métricas, disponibilidade semântica, lifecycle, limitações e resultado Cache.
- Corrigir apenas findings de segurança introduzidos ou diretamente tocados nesta fase; reportar legados separadamente.

### 6. Cache E2E real
- Validar `/health`, `/version`, contrato `1`, revision `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`, isolamento do parser e ausência de credencial privilegiada.
- Usar exclusivamente upload `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043` e job `a31f5c25-b0d8-41ac-8225-27814cd1732a`, sem upload sintético, inserts manuais, limpeza ou reset direto.
- Só acionar o caminho oficial se todos os gates permitirem retomada segura. Caso contrário, encerrar `CACHE IMPLEMENTATION STATUS` separadamente de `CACHE REAL E2E STATUS = BLOCKED`, com o bloqueador exato.

## Critérios de aceite
- **F PASS:** identidade automática/manual, confirmação/rejeição, histórico/provenance, concorrência e nickname não-forte comprovados.
- **F1 PASS:** nenhum cálculo depende de `participantKey == steamId`; métricas são isoladas pelo participante real.
- **F2 PASS:** AIM/POSITION/ECONOMY/UTILITY localizados, preservados, isolados e NULL/unavailable quando ausentes.
- **F3 PASS:** runner usa apenas o lifecycle oficial e prova estado real/idempotência no banco.
- **F4 PASS:** somente após a demo Cache real completar toda a cadeia com evidência. Sem isso, F4 permanece BLOCKED.

## Fora de escopo
- Redesign visual, Player DNA/AI Coach finais, ML, redução ou sampling adicional de RAW, mudança do contrato/revision, fake FACEIT/GC, secrets ou service-role no Railway, migrations destrutivas e qualquer dado sintético.

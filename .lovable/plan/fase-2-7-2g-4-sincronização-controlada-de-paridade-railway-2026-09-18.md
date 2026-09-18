# Fase 2.7.2G.4 — Sincronização controlada de paridade Railway

## Objetivo
Preparar e validar, sem deploy ou execução da demo Cache, um patch cirúrgico na branch de staging `infra/cs2-parser-worker-v8-parity-g4` que leve a lógica atual da MAIN para o worker Railway sem remover o isolamento de processo, o lifecycle durável nem a identidade real do build.

## Execução
1. Obter e congelar os três baselines: MAIN `595e26badda495d6e4eb5be383681f4a535f7064`, Railway `infra/cs2-parser-worker-v8` e staging `infra/cs2-parser-worker-v8-parity-g4`; se qualquer branch permanecer inacessível, marcar os gates dependentes como BLOCKED.
2. Produzir inventário arquivo a arquivo de parser, RAW evidence, RAW artifact, HOT, adapter, app, settings, worker, isolamento, dependências e Docker, classificando cada diferença como `MUST SYNC`, `MUST PRESERVE`, `MERGE CIRÚRGICO` ou `TEST ONLY`.
3. Aplicar somente na staging as diferenças funcionais comprovadas da MAIN, preservando `parser_isolated.py`, `parser_child.py`, `worker_main.py`, o `worker.py` Railway, `RAILWAY_GIT_COMMIT_SHA`, claim/heartbeat/cancelamento/stale/retry e supervisão após crash do child.
4. Validar compatibilidade explícita de `_parse_ticks` e `_parse_grenades`, contrato 1, `demoparser2==0.42.0`, revisions semântica/build, limites HOT/RAW, cadeia de chunks, digests e admissão fail-closed.
5. Adicionar ou ajustar apenas testes de paridade necessários para provar os 16 casos de segurança, isolamento, lifecycle e ausência de RAW no HOT; nenhum teste será removido ou relaxado.
6. Executar suítes Python, RAW, HOT, adapter, worker/isolation, Canonical/pipeline/APP, typecheck, compileall, diff check e build; registrar PASS/FAIL/SKIPPED/WARNING com causa.
7. Criar `services/cs2-demo-parser/docs/cache-g4-railway-parity-audit.md`, atualizar o roadmap e fechar G4-01–G4-24 sem inferir PASS onde faltar evidência.

## Restrições preservadas
- Sem Cache Run 1/Run 2, retry, requeue, Canonical, match, métricas ou features.
- Sem alteração de banco, Storage, secrets, artifact, manifest, chunks ou dados de produção.
- Sem deploy Railway e sem merge cego MAIN→Railway.
- Contract 1, RAW integral privado, HOT limitado e todos os comportamentos fail-closed permanecem obrigatórios.
- O resultado máximo desta fase é readiness documentada para um deploy Railway posterior e explicitamente autorizado.

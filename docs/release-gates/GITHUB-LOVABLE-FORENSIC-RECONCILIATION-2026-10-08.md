# GitHub / Lovable — reconciliação forense

Data: 2026-10-08, observações entre 09:42–09:46 UTC.

**DECISÃO: RECONCILIAÇÃO DOCUMENTADA / PREPARAÇÃO LOCAL VALIDADA / RELEASE BLOQUEADO.**
Não equivale ao cumprimento integral das 13 condições de produção: Player DNA e AI Coach reais não estão conectados; lifecycle browser e taxonomia terminal ainda exigem provas. Nenhum DEM real foi processado nesta auditoria, nenhum workflow foi disparado, nenhum dado/segredo/Railway foi alterado e nenhuma autorização foi concedida.

## A) GITHUB SYNC

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Fonte GitHub main | VERIFIED_READ_ONLY | GET `/repos/GameProAcademy/cs2-pro-hub/git/ref/heads/main`: `05a5bea00a3d2615674cfbcc47f7d91ee42712d8`, reconfirmado às 09:45 UTC. Conexão: Game's GitHub API. |
| Árvore local inicial | MATCH | HEAD no mesmo commit; árvore `c35eaa82559498dcd92ec1fb356af12ab1002224`; igualdade de árvore, não somente comparação de nomes. |
| Correção runtime smoke | PRESERVED | `scripts/a91/wasm_smoke.mjs:21-40`: `initSync` exports, allocator executável, sem chamada obrigatória a `__wbindgen_free`. |
| Divergências intencionais | TESTS_AND_DOCUMENTATION_ONLY | `contracts-node-checks.mjs` passa a desestruturar `{parser, wasmExports}`; `test_diagnostics.py` fornece os dois campos de identidade exigidos ao subprocesso sintético. Relatório e roadmap atualizados. Nenhum parser, binding, binário, pin ou fluxo de produção modificado. |
| A9.1 externo mais recente | FAILED, NOT PASS | Run #15, [37727668410](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/37727668410), commit `8477958a93109433c379b91364759809b6c32a14`, concluído com failure em 04:34:30 UTC. Causa exata não inferida do status. |
| Reconstrução externa em andamento | NOT_PROVEN | Remediation #11, [37758388458](https://github.com/GameProAcademy/cs2-pro-hub/actions/runs/37758388458), commit `05a5bea`, in_progress às 09:44 UTC. Execução preexistente do usuário; não iniciada por esta auditoria. Mesmo sucesso do smoke não provaria quatro execuções DEM/paridade/determinismo. |

## B) LOVABLE APP

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Auth e experiência existente | IMPLEMENTED_SOURCE | `src/lib/auth.ts`, `useAccount.ts`, middleware autenticado; não houve teste de login/signup nem leitura das configurações hospedadas nesta auditoria. |
| Upload | PARTIAL | UI, TUS e hash worker existem; `FEATURES.realDemoParser=false`, `clientDemParserPoc=false`. Não foi conectada uma nova entrada de execução. |
| Dados demonstrativos | IMPLEMENTED_DEMO_ONLY | `src/config/app.ts:12`; getters de `src/services/playerService.ts:41-61` retornam demonstrações incondicionalmente. Alterar apenas DEMO_DATA não conecta dados reais e removeria avisos de demonstração. |
| Estado do A9.1 visível e atualizado automaticamente | NOT_PROVEN | Não foi implementado/importado um resultado real do GitHub nem marcada aprovação manual na interface. |
| Compatibilidade necessária | LOCAL_TESTS_CORRECTED | Duas regressões concretas de testes; nenhuma necessidade comprovada de substituir o parser GitHub ou abrir produção. |

## C) DATABASE — LOVABLE CLOUD

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Disponibilidade | HEALTHY_READ_ONLY | Auth, database e integração entre ambas alcançáveis; database e pool up, 9/60 conexões, 59% memória, 15% disco, sem exaustão recente registrada. Créditos/saldo não consultados. |
| Tabelas | 52 / RLS 52 | Catálogo live: 52 tabelas públicas, zero sem RLS. `uploads`, `demo_jobs`, RAW artifacts/chunks, matches/metrics/features, DNA snapshots, coach, roles/profiles, provenance/nonces/ledger. |
| Tenant/admin | POLICIES_VERIFIED_READ_ONLY | Policies consultadas: uploads/jobs/identity por user_id ou staff; matches por ownership/staff; DNA e métricas por jogador/staff; coach messages ownership e insert role=player; roles sob master. Grants anon isolados não provam exposição: `demo_identity_decisions` tem SELECT só authenticated e qual de ownership. |
| Constraints/indexes | PRESENT, NOT EXHAUSTIVELY PROVEN | Jobs: 21 checks, 16 indexes, 1 unique constraint; uploads e relações Canonical possuem constraints/índices. Uniqueness implementada como índice parcial não é contada como pg_constraint. Não foi executado teste concorrente no banco live. |
| Storage | PRIVATE_BUCKETS_VERIFIED | avatars, demos, r5-forensic-staging, cs2-raw-evidence todos private. RAW aceita JSON/gzip, teto de objeto 16 MiB; teto de bucket não altera teto contratual do chunk. Consulta de metadata não prova integridade física dos objetos. |
| Histórico de atestação | PRESERVED / STALE | 3 provenance VERIFIED, 3 nonces; zero provenance VERIFIED dentro da janela de 24 horas. Não renovados ou reutilizados como prova A9.1. |
| Inventário Canonical | BLOCKED | 105 rows, 0 authorized, 0 parity VERIFIED, 0 determinism VERIFIED. |
| Cache attempts | ABSENT | 0 Attempt 9 e 0 Attempt 10+ para o SHA Cache reservado; consulta aggregate não generalizada para todos os DEMs. |
| Linter | REVIEW_REQUIRED | 15 findings: 4 RLS sem policy (INFO), 1 extensão public (WARN), 10 SECURITY DEFINER executáveis por authenticated (WARN). Não alterados automaticamente; ausência de policy pode ser bloqueio intencional, funções precisam análise individual. |

Somente SELECT/catalog/health/linter, sem migrations nem writes. Testes de concorrência usam PostgreSQL local descartável, não Lovable Cloud.

## D) PARSER INTEGRATION

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Identidade | MATCH_SOURCE_AND_BYTES | demoparser2 0.42.0; manifest público e `clientParser.runtime.ts:32-56`; binding SHA `d59a85ff33d36387f0fb814991f3b83bd0166eee7b7f4e761aa34ee05d9af756`, WASM SHA `43c57d499e0acf126bc318b6b552082bf3dfe476b1208efadd922ef2326e8c4f`, recomputados localmente. |
| Provenance upstream | PARTIAL_REPRODUCIBILITY | Source commit `d3767705dc5846d73ed29db50eaeda58778dc934`; manifest declara upstream toolchain unpinned, tag unsigned, reconstrução local não bit-identical. Matching bytes não é prova de deployed parity. |
| Inicialização real sem DEM | PASS_LOCAL | Teste Node inicializa binding/binário real, verifica declared exports e memory; nenhum método de parse DEM invocado. |
| Manifest/result digest | IMPLEMENTED | `clientParser.manifest.ts:19-60`: demo, parser, artifact, surface, contrato, catálogo e resultado; telemetry/name/mtime fora do digest determinístico. |
| 16 domínios A9.1 | IMPLEMENTED_MECHANICS_ONLY | `scripts/a91/parity.mjs` e regressões de comparações completas/duplicadas/ausentes; capability-aware NOT_COMPARABLE com equal=null. Nenhuma equivalência real estabelecida. |
| APIs indisponíveis | EXPLICIT | parsePlayerInfo e parseChatMessages não exportados pelo artefato público; inventário não disponível tem count=null/status explícito. [] de container indisponível não deve ser tratado como observação de ausência. |

## E) WEB WORKER

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Isolamento de produção | SOURCE_SEALED | `clientParser.service.ts:35-40` recusa PROD; flags false. Prova de bundle implantado permanece separada. |
| Lifecycle normal | IMPLEMENTED_SOURCE | Worker novo por parse; finish termina Worker em COMPLETE/ERROR/CANCELLED/onerror/timeout (`:68-148`); cancel termina diretamente (`:161-174`). |
| Cancelamento e fencing | PARTIAL | requestId filtra eventos; hash AbortController. Não há teste browser end-to-end neste trabalho. Janela de READY/hash async e estado compartilhado precisa teste dedicado: callback antigo pode chegar ao postMessage ou finish e afetar controller/reject atuais; não declarar robustez integral por inspeção. |
| Startup failure | REVIEW_REQUIRED | Worker criado antes de preparar URLs e de instalar todos os handlers; rejeição/throw nessas etapas e postMessage devem ser incluídos na prova de cleanup. |
| Traps/OOM | PARTIAL | Tipos declaram erro de runtime, porém `clientParser.worker.ts:155-168` agrega erros não reconhecidos em CLIENT_PARSE_FAILED/PARSER_UNAVAILABLE; distinção trap/memory ainda não demonstrada no browser. Não alterar o parser upstream para compensar. |
| Memória | NOT_PROVEN_FOR_LARGE_DEM | Input contíguo, 128 MiB preservados; File enviado ao Worker, materialização na boundary; saída JSON compacta limitada, não RAW completo. Nenhuma prova de RSS/peak/abort de 473 MB browser. Transferables de saída JSON não substituem análise de cópias/overhead WASM. |

## F) CANONICAL

**BLOCKED.** Fonte fail-closed em realDemAdmission/readiness, Canonical persistence e RPC de autorização. Banco confirma inventário sem qualquer autorização/paridade/determinismo; provenance fresca ausente; A9.1 real não aprovado. Prova local, smoke ou mock nunca autoriza persistência, limpeza ou Attempt 9. Coverage de ledger e parity de fonte implantada não inferidas de árvore local ou ledger vazio.

## G) PLAYER DNA

**PARTIAL / DEMO ONLY.** `src/routes/_authenticated/player-dna.tsx:34-45` usa getPlayerDna e aviso de demonstração; getter retorna demoPlayerDna. Não existe prova aqui de consumo real exclusivamente por métricas validadas com trilha até evidence. Não marcar condição de produção concluída nem conectar DEM não autorizado para preenchê-la.

## H) AI COACH

**PARTIAL / DEMO ONLY.** `CoachChat.tsx:46-70`: respostas fixas locais, sem request de IA; mensagens identificadas como exemplo. Nenhuma nova conexão com IA ou dados privados. Consumo de dados Canonical autorizados e distinção observado/calculado/inferido/indisponível precisam contrato real futuro e teste de negação; não provados por placeholders.

## I) SECURITY

**IMPLEMENTED SOURCE / LIVE POLICIES OBSERVED / E2E NOT PROVEN.** RLS de 52 tabelas, private buckets e grants restritos de evidence observados. Preserve service-only writer, ledger read mínimo, pre-parser fail-closed e immutable provenance. Sem segredo, DEM URL, RAW, signed URL ou private child evidence no relatório. Public workflow upload limita três arquivos; outputs privados separados e limpeza testada. Secrets/billing/current Railway deployed parity/source-map público não inspecionados. Não houve mudança de chave, autenticação, configuração ou infraestrutura.

## J) TESTS

| ITEM | STATUS | EVIDENCE |
|---|---|---|
| Primeira suíte | 1425 PASS / 2 FAIL | 106 arquivos; Node teste lia wrapper antigo do retorno `{parser, wasmExports}`; diagnóstico Python não preenchia identidade exigida e falhava antes de sua injeção de memória. |
| Correções | TEST CONTRACT ONLY | Desestruturar retorno e verificar memory real; fornecer env synthetic para alcançar estágio de falha sob mock de child. Não mockam PASS real nem removem validação. |
| Suíte final | 1427 PASS / 106 FILES | `bunx vitest run`, 09:45 UTC; inclui 17 unittests Python pelo harness, Node safety/init e PostgreSQL descartável. Erros SQL esperados da injeção concorrente não são erro live. |
| Configuração pública | PASS | `verify-public-build-config.mjs`: PUBLIC_BUILD_CONFIG_OK. |
| Bundle browser | NOT_PROVEN | `verify-browser-parser-build.mjs`: H3E91_BROWSER_BUILD_OUTPUT_MISSING. Não executado build manual para inventar prova de deployment. |
| Preview compile | PASS_SIGNAL | Último log automático observado: build OK, 09:45:23 UTC. Não prova comportamento/parsing/produção. |
| Lint | NOT_RUN_THIS_AUDIT | Não reaproveitar resultado histórico como validação atual. |

### Matriz dos 19 cenários pedidos

| Cenário | Evidência disponível / limite |
|---|---|
| 1. Upload pequeno | clientParser.input.test: File aceito materializado somente na boundary; upload E2E real não executado. |
| 2. Upload grande | largeDemFeasibility.test: ceiling 128 MiB, hash streaming e capability desconhecida; 473 MB parse browser NOT_PROVEN. |
| 3. Cancelamento | source cancel/abort; testes de runners de hash/memória; parser service browser E2E NOT_PROVEN. |
| 4. Worker termination | source finish/cancel + timeout finito; fatal/retry browser E2E NOT_PROVEN. |
| 5. Duplicate execution | A9.1 unique run IDs e DB local concorrente; Worker service duplicate READY não comprovado. |
| 6. Stale result | requestId na source e stale gates puros; race READY/hash não comprovada end-to-end. |
| 7. Artifact mismatch | Node bytes/hash e client contract negativas PASS. |
| 8. Parser version mismatch | client envelope/readiness negativas PASS. |
| 9. Contract mismatch | Node catálogo/contrato e client result negativas PASS. |
| 10. Provenance mismatch | envelope/artifact checks PASS sintético; deployed provenance NOT_PROVEN. |
| 11. Parity blocked | harness/domínios/admission negativas PASS; real parity não executada aqui. |
| 12. Determinism blocked | altered normalized output/identidades negativas PASS; real determinism não executado aqui. |
| 13. Canonical blocked | admission e rawAdmission persistence negativas PASS. |
| 14. NOT_AVAILABLE | capability-aware comparação/domínios PASS; nenhuma ausência convertida em igualdade. |
| 15. WASM initialization failure | artifact/export negatives PASS com artefato real sem DEM; browser init failure cleanup NOT_PROVEN. |
| 16. WASM runtime failure | classification/diagnostics sintéticos PASS; real browser trap NOT_PROVEN. |
| 17. Memory failure | injected child diagnostics PASS; browser OOM e memória de DEM real NOT_PROVEN. |
| 18. Valid parser result | bounded envelope aceito como UNTRUSTED_CLIENT_RESULT_VALIDATED e Canonical BLOCKED; parser DEM real válido NOT_PROVEN. |
| 19. Coach only Canonical | NOT_IMPLEMENTED_REAL_CONSUMER; placeholders não provam contrato de dados autorizados. |

## K) RISK REGISTER

| Severidade | Risco | Disposição |
|---|---|---|
| CRITICAL | Confundir smoke/local tests/source parity com autorização DEM ou Canonical | Gates continuam bloqueados; exigir quatro runs reais e revisão independente. |
| HIGH | DNA/Coach demonstrações tratadas como produção ao desligar aviso | Não alterar DEMO_DATA; criar consumidor validado somente em fase aprovada. |
| HIGH | Race READY/hash antigo, startup failure e cleanup do service | Provar em harness Worker dedicado antes de A9.2; não abrir produção para testar. |
| HIGH | Trap/OOM browser agregados em erro genérico | Contrato terminal específico e testes reais isolados antes de promover browser. |
| HIGH | Provenance stale e parity Railway/deployed não atual | Não usar histórico como prova fresca; read-only revisão independente. |
| MEDIUM | 15 linter findings e SECURITY DEFINER | Revisão individual, sem reinstalar privilégios intencionalmente revogados. |
| MEDIUM | Runtime artifact upstream não bit-reproducível | Preservar identity/hash e comparar nova reconstrução só após revisão; não trocar silenciosamente. |
| MEDIUM | Bundle/source-map atual ausente | NOT_PROVEN separado de A9.1 laboratório; não reclassificar como PASS. |
| LOW | Comentários históricos dizem inexistência de banco/parser | Registrar como DEPRECATED_DOCUMENTATION, não fonte de estado live; não ampliar refactor. |
| LOW | Roadmap histórico contém NOT_RUN que execuções externas já superaram | Este snapshot substitui somente o estado atual da reconciliação, sem reescrever histórico. |

## L) NEXT GATE

1. Aguardar e revisar resultado externo do remediation #11, sem disparar/persistir nada. Smoke real inicializa WASM, mas não valida DEM.
2. Após revisão do source/artifact/runner/fixture e autorização independente, usuário executa manualmente A9.1: Python #1/#2, WASM #1/#2, identidades únicas, um DEM e artefato, paridade e determinismo completos. Esta auditoria não autoriza nem inicia a execução.
3. Revisar evidências públicas sanitizadas e provas independentes; uma falha, ausência ou indisponibilidade não comparável nunca vira igualdade/autoridade.
4. A9.2 continua separado e bloqueado: lifecycle/cancel/stale/fatal cleanup, memória, deployed bundle e 473 MB browser requerem revisão própria. DNA/Coach reais seguem pendentes de consumidores autorizados.
5. Attempt 9/10+, Canonical, produção, Railway e mudanças de segredo permanecem LOCKED mesmo após PASS local e mesmo após futuro A9.1 PASS.
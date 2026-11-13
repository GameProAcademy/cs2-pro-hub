# CS2 PRO — Checkpoint central de continuidade

> **Primeira leitura de toda retomada.** Depois deste arquivo, abra **somente** o checkpoint
> da fase ativa. Protocolo: `docs/checkpoints/README.md`. Este arquivo não é verdade
> absoluta: confira o estado real do GitHub (seção 24) e corrija-o se divergir.

Atualizado em: 2026-11-13 (America/Sao_Paulo), PM6 — gate de reconciliação pós-PM1 · por: sessão Claude
`session_012aG79D5h8yCsYxNjWpDaHG`

Estados usados: CONFIRMADO · IMPLEMENTADO, NÃO VALIDADO · VALIDADO EM TESTE · VALIDADO EM
PRODUÇÃO · PENDENTE · BLOQUEADO · NÃO APLICÁVEL.

## ESTADO EXATO PARA RETOMADA

| Item                               | Valor                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase atual                         | **PM6** (matriz de compatibilidade de demos), executado depois do PM1 e antes do PM2 por ordem do dono (2026-11-13). PM1 concluído e validado em produção                                                                                                        |
| Etapa atual                        | PM6 PR A: reconciliação + baseline/pesquisa/benchmark + corpus (`docs/pm6/`, `docs/reference/CS_DEMO_MANAGER_BENCHMARK.md`, `docs/reference/compatibility/corpus_manifest.json`)                                                                       |
| Última etapa concluída             | Corpus PM6 analisado em sandbox: 6 demos. Valve 2024 e BLAST APPROVED; **FACEIT e GamersClub reais BLOCKED** na auditoria RAW por eventos não revisados (`show_survival_respawn_status`, `player_chat`). Ver `docs/pm6/PM6_BASELINE_RESEARCH_MATRIX.md`          |
| Última operação concluída          | Gate de reconciliação PM6 (read-only): Railway/`/version`/checks/checkpoint/bundle; resultado no documento acima                                                                                                                                                 |
| Operações em andamento             | Nenhuma em produção. Conectores Railway, Lovable e remote-devices indisponíveis nesta sessão (HTTP 502)                                                                                                                                                          |
| Processos em execução              | Nenhum                                                                                                                                                                                                                                                           |
| Alterações locais não commitadas   | Nenhuma                                                                                                                                                                                                                                                          |
| Branch ativa                       | `main` + `docs/pm6-a-reconciliation`                                                                                                                                                                                                                             |
| Último commit confirmado em `main` | `e2d2bdd69e9eca632f30e4a2d7e62cd0d517ebfe` (merge do #277), CI verde nesse SHA exato (reconciliação §C). #276 → `67655b5a`; #275 → `c3593d48`; #274 → `616c51f8`; #273 → `ea7ed8df`                                                                              |
| Build validado em produção         | App: `67655b5a`, validado em 2026-11-13 com a demo autorizada; `e2d2bdd6` publicado (`879daee6`), mas o SHA do bundle não é verificável (reconciliação §E). Worker: `c3593d48` (Railway `d57b9089`, demoparser2 0.42.2, `/version` conferido 2026-11-13 14:48Z)  |
| Problemas abertos                  | Seção 21; metodologia §20; relatório de fundação §J                                                                                                                                                                                                              |
| **Próxima ação exata**             | PM6 PR F: revisar `show_survival_respawn_status.*` e `player_chat.*` (IGNORED_APPROVED) com regressão e catálogo; depois o release controlado do worker (publicação do app pelo dono). Em seguida, investigar o `PLAYER-COVERAGE` da GC Cache sem afrouxar gates |
| Ações que NÃO devem ser repetidas  | Auditorias da fundação; pesquisa de 2026-11-11; mapeamento 4.2; Marco 1; benchmarks spatial-v1/R5.8.25; deploy `d57b9089`; migration `20261113040000`; validação da demo `furia-vs-vitality-m2-dust2` (job `aa968c9e`); gate de reconciliação PM6                |
| Ações manuais necessárias          | Seção 22                                                                                                                                                                                                                                                         |

## 1. Identificação

Projeto: CS2 PRO Hub / CS2 PRO AI Coach · Repositório: `GameProAcademy/cs2-pro-hub` ·
Aplicação: https://gamepro.network · Banco e publicação: Lovable Cloud · Parser: Railway.

## 2. Estado atual do projeto

`main` = `e2d2bdd6` (merge do #277), CI verde no SHA exato. Fundação publicada (Score `pro-score-v1`, DNA
`dna-weighted-v2`). Fase 4.2: especificação v1.1 registrada; **PM1 (4.2.1–4.2.2) concluído e validado em
produção**: `metric-contract-v1.1`, `spatial-heatmap-v1`, `/maps`, release do parser R5.8.25 (demoparser2 0.42.2).
Relatório: `docs/pm1/PM1_EXECUTION_REPORT.md`. Em execução: PM6 (`docs/pm6/`).

## 3. Objetivo da missão vigente

Missões concluídas: fundação; protocolo de continuidade (#260, #261); metodologia (2026-11-11); mapeamento 4.2
(#263); PM1 (#270–#277). **Missão vigente: PM6**, a matriz de compatibilidade de demos CS2 (FACEIT, GamersClub,
Valve, servidores privados, torneios). O texto do dono foi recebido em 2026-11-13. Ordem: gate de reconciliação
read-only → baseline, pesquisa e benchmark → harness/corpus → protocolo → usercmd/timing → capabilities →
eventos → performance → release. Nada de Lovable, backfill ou reprocessamento sem autorização específica.

## 4–5. Fase 4.2: entregas, módulos, Prompts Mestres e fases do protocolo

- Especificação original: `docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre.md`
  (byte a byte, SHA-256 `989ec11f…`). Mapeamento: `docs/specifications/FASE_4_2_MAPEAMENTO.md`.
- **10 entregas** `4.2.1`–`4.2.10` e **módulos** `A`–`J`: confirmados no original (§8, §9, §34).
- **Prompts Mestres: divisão confirmada pelo dono em 2026-11-12** (`docs/specifications/README.md`):
  - PM1 = 4.2.1–4.2.2 (A, B);
  - PM2 = 4.2.3–4.2.4 (B, I);
  - PM3 = 4.2.5–4.2.6 (C, D);
  - PM4 = 4.2.7–4.2.8 (E, F, G, J);
  - PM5 = 4.2.9–4.2.10 (H, I, J).
- **PM6** (2026-11-13) é uma missão transversal de compatibilidade de demos, executada antes do PM2.
- As "Fases 1–5" originais deste protocolo correspondem aos PM1–PM5.
- Os arquivos `checkpoints/PHASE_*` ficam como histórico. O estado por PM vive nos relatórios
  `docs/pm1/` e `docs/pm6/`.

| Fase    | Nome / escopo                    | Situação                        | Checkpoint                           |
| ------- | -------------------------------- | ------------------------------- | ------------------------------------ |
| 1 (PM1) | 4.2.1–4.2.2, módulos A e B       | CONCLUÍDA, validada em produção | `pm1/PM1_EXECUTION_REPORT.md`        |
| PM6     | Compatibilidade de demos         | EM EXECUÇÃO                     | `pm6/PM6_POST_PM1_RECONCILIATION.md` |
| 2 (PM2) | 4.2.3–4.2.4, módulos B e I       | PENDENTE (depois do PM6)        | `checkpoints/PHASE_2_CHECKPOINT.md`  |
| 3 (PM3) | 4.2.5–4.2.6, módulos C e D       | PENDENTE                        | `checkpoints/PHASE_3_CHECKPOINT.md`  |
| 4 (PM4) | 4.2.7–4.2.8, módulos E, F, G e J | PENDENTE                        | `checkpoints/PHASE_4_CHECKPOINT.md`  |
| 5 (PM5) | 4.2.9–4.2.10, módulos H, I e J   | PENDENTE                        | `checkpoints/PHASE_5_CHECKPOINT.md`  |

## 6–8. Fase em execução, última etapa, próxima ação

Ver "ESTADO EXATO PARA RETOMADA".

## 9. Arquivos analisados (fundação)

Lista e evidências em `checkpoints/FOUNDATION_CHECKPOINT.md` §C e em
`docs/foundation/FOUNDATION_REPORT.md`.

## 10. Arquivos modificados (fundação)

`src/lib/playerDna.ts`, `playerDnaSnapshot(.server).ts`, `quarantineRead.server.ts`,
`playerData.functions.ts`, `proScore.ts`, `proScore.functions.ts`,
`components/real/{RealDna,RealProScore}.tsx`, rotas `dashboard.tsx` e `performance.tsx`,
`coach/coachContext.ts`, `coach.functions.ts`, i18n (5 idiomas), testes e
`docs/reference/{PRO_SCORE,COACH_CONTEXT,METRICS_CATALOG}.md`.

## 11. Decisões técnicas (resumo; justificativas no relatório de fundação)

1. Score é índice absoluto, sem percentil/tier/benchmark; pesos são decisão de projeto v1.
2. Score não é persistido; `player_score_snapshots` permanece vazia e sem uso.
3. DNA v2: média ponderada pela amostra; complementos e amostras finas fora do índice.
4. Leituras (GET) não escrevem; snapshot do DNA por POST próprio.
5. Quarentena H.3-E respeitada na leitura do jogador, falhando fechado.
6. Nenhum item novo de menu; módulos A–F irão em abas de uma futura `/matches/$matchId`.
7. Guard de resposta do Coach não foi alterado; os fatos passaram a levar o Score numérico.
8. **Decisões de produto de 2026-11-11** (detalhe e rótulos em `docs/product/CS2_PRO_PRODUCT_METHODOLOGY.md`):
   DNA = indicadores internos 0–100 sem alegação de calibração (§3, §7); `pro-score-v1` e pesos
   preservados, heurísticos, nova metodologia = nova versão (§8–§10); inteligência espacial
   aprovada como objetivo, arquitetura proposta mas **não implementada** (§11–§13); vocabulário
   único de estados de dados mapeado sobre os existentes (§14); regras de versionamento (§18).

## 12–13. Problemas encontrados e correções

| Problema                                                                                    | Correção | Estado               |
| ------------------------------------------------------------------------------------------- | -------- | -------------------- |
| Score inexistente                                                                           | PR #257  | VALIDADO EM PRODUÇÃO |
| DNA v1: dupla contagem, média de razões, amostra fina, GET com escrita, quarentena ignorada | PR #256  | VALIDADO EM PRODUÇÃO |
| Coach perdia o Score real (guard só aceita números numéricos nos fatos)                     | PR #258  | VALIDADO EM PRODUÇÃO |

## 14. Testes executados

PM1/R5.8.25: worker 554, scripts 423, vitest com cerca de 2.360 aprovados; CI verde no SHA exato de cada PR e em `e2d2bdd6`
(relatório PM1 §10; reconciliação PM6 §C). Fundação, histórico: suíte local com PostgreSQL descartável após #258: 2311 aprovados, 1 ignorado, 0 falhas.
`proScore.test.tsx` 28; `playerDnaV2.test.ts` 25; mutantes 6/6 + 4/4 + 1/1 detectados; `tsc`
0 erros; ESLint 0 erros. Estado: VALIDADO EM TESTE.

## 15. Testes pendentes

E2E automatizado das telas novas (não existe); tabela do Score em celular com dados reais;
idiomas ≠ pt-BR em produção.

## 16–17. Branches, commits e PRs

| PR                                | Branch                             | Merge em `main`       | Estado                                         |
| --------------------------------- | ---------------------------------- | --------------------- | ---------------------------------------------- |
| #256 DNA v2                       | `fix/player-dna-v2`                | `0ebfedf2`            | merged                                         |
| #257 Score v1                     | `feat/pro-score-v1`                | `975c7d11`            | merged                                         |
| #258 Coach/Score                  | `fix/coach-score-facts`            | `f1276859`            | merged                                         |
| #259 Relatório de fundação        | `docs/foundation-report`           | `13cfcde8`            | merged                                         |
| #260 Protocolo de continuidade    | `docs/continuity-checkpoints`      | `72fb0cdb`            | merged                                         |
| #261 Checkpoint pós-#260          | `docs/continuity-after-260`        | `106f20c6`            | merged                                         |
| #262 Metodologia                  | `docs/product-methodology`         | `b2c8219c`            | merged (PR `82efb867`, 5 checks verdes)        |
| #263 Marco 0 Mapeamento 4.2       | `docs/fase-4-2-mapping`            | `bf57069e`            | merged, gates verdes                           |
| #264 Marco 1 round-context-v1     | `feat/round-context-v1`            | `e60a70f6`            | merged, gates verdes, publicado e validado     |
| #265 Textos do Raio-X             | `fix/xray-side-copy`               | `f4460123`            | merged                                         |
| #266 4.2.1 metric-contract-v1     | `feat/metric-contract-v1`          | `4c6f5067`            | merged, gates verdes                           |
| #267 spatial-v1 camada A (parser) | `feat/spatial-v1-event-positions`  | `4badf606`            | merged; release R5.8.24 concluída (#268/#269)  |
| #270–#273 PM1 A–D                 | `feat/pm1-*`                       | `e6e507d3`…`ea7ed8df` | merged, publicados (`/maps`)                   |
| #274 Polimento do heatmap         | `fix/pm1-heatmap-ui-polish`        | `616c51f8`            | merged                                         |
| #275 demoparser2 0.42.2 (R5.8.25) | `release/r5-8-25-demoparser2-0422` | `c3593d48`            | merged; worker no ar (`d57b9089`)              |
| #276 Re-pin R5.8.25               | `release/r5-8-25-repin`            | `67655b5a`            | merged; migration aplicada; atestação VERIFIED |
| #277 Evidência PM1 / matriz       | `docs/pm1-r5825-evidence`          | `e2d2bdd6`            | merged; CI verde em `e2d2bdd6`                 |
| PM6 PR A Reconciliação            | `docs/pm6-a-reconciliation`        | —                     | aberto                                         |

PRs abertos antigos (#7–#161, fora desta missão): não tocados; alguns são autorizações H.3-E
do dono. Não fazer merge nem fechar sem instrução.

## 18. Estado do CI

`main` `e2d2bdd6`: Quality Gates (43373885573), Queue Semantics Probe (43373885425), R5.8.3 (43373885821),
R5.8.4 (43373915358), F553 pós-conclusão (43377059225): todos `success`. H.3-E: 1ª execução BLOCKED
(43376276588, F553 ainda rodando); 2ª PASS 18/18 (43377084815). CONFIRMADO em 2026-11-13 (reconciliação PM6 §C).

## 19. Publicação e deploy

App:

- `67655b5a`: VALIDADO EM PRODUÇÃO em 2026-11-13 (`/maps`, demo autorizada).
- `e2d2bdd6`: publicado (`879daee6`), mas o SHA do bundle não é verificável (`NOT_VERIFIABLE_WITH_AVAILABLE_EVIDENCE`,
  reconciliação PM6 §E). Diferença funcional nula.

**Regra do PM6 §14:** a partir de 2026-11-13 a publicação do app é ação manual do dono. O Claude não aciona
`deploy_project`.

Worker: Railway `d57b9089` (`c3593d48`), atestado (`841c0bb9`). A configuração do serviço mostrava
`source.commitSha = 4716f894` (reconciliação PM6 §A).

## 20. Gates de segurança e critérios não comprovados

Inalterados e preservados: RLS, ownership, autenticação, autorização no servidor, admin
master, rate limits, idempotência, leases, reservations, response guards, parser identity,
build pin, H.3-E, runtime attestation, gates de ativação. Coach: OpenRouter
`openai/gpt-oss-20b`, sem fallback. Não comprovado: logs do servidor de produção.

## 21. Riscos e limitações conhecidas

1. Índices por dimensão do DNA não calibrados (regra "< 60" do Raio-X e prioridade de treino).
2. Pesos do Score não ajustados estatisticamente.
3. Posições: o parser no ar (`c3593d48`, demoparser2 0.42.2) emite posição do atacante e da vítima no tick da morte; partidas antigas continuam sem posição (nada reprocessado); qualquer métrica espacial depende da revisão de L02.
4. `buy_context` e `survived` vazios em `round_players`; `weapon_fire` sem autor.
5. H.3-E Activation Gate falha na 1ª execução de todo merge e passa na 2ª.
6. `gate1d.test.ts` estourou 5 s uma vez no CI (hipótese: carga do runner).
7. Amostra de produção mínima (3 perfis, 6 partidas, 5 linhas de features).
8. Constantes de normalização do DNA (ex.: ÷120, ÷12, ÷0,4, ÷2,5, rating ÷1,6) funcionam como
   escalas de referência sem fonte (metodologia §3.2).
9. Posições contínuas: as amostras de tick do parser (até 4.096 linhas, desbaste uniforme) continuam
   persistidas só como contagens. As únicas posições persistidas são as do tick da morte (item 3). Não há
   trajetória, presença nem exposição (L02).
10. Railway: a configuração do serviço mostrava `source.commitSha = 4716f894` (R5.8.16) enquanto o
    deployment ativo é `c3593d48`. Provável pin persistente; um deploy pela fonte construiria código antigo. Esse
    código falharia fechado na atestação, na ponte e no lock. Reler com o conector e só alterar com autorização
    (reconciliação PM6 §A).
11. O `/version` do worker declara `parser.version` por constante; a versão instalada só aparece no preflight
    autenticado e não é comparada no startup (reconciliação PM6 §B.3).
12. `L04-MATCH-RESULT-UNRESOLVED` bloqueia identidade de time, placar e resultado da partida. O
    lado vencedor do round **existe** e foi validado (mapeamento §4) — correção de 2026-11-12.
13. `L02` (domínio de ticks) e `L03` (usercmd) restringem densidade/replay/movimento e
    mira/counter-strafe da 4.2 (mapeamento §4).
14. Não existe mecanismo de feature flag, embora a especificação mande reutilizá-lo.
15. Dependências transitivas do parser não fixadas (pandas, numpy, polars, pyarrow): os builds de 2026-11-12/13 resolveram pandas 3.1.1 / numpy 2.5.4; saída conferida idêntica na demo de benchmark. Fixá-las é uma mudança de runtime a decidir.
16. demoparser2 0.42.0 não lê demos atuais do CS2 (`EntityNotFound`); por isso a R5.8.25 (0.42.2). O parser de navegador A9.1 continua WASM 0.42.0 (fora de produção).
17. `_EVENT_OTHER_PROPS` do parser nunca chegou às linhas de produção (pendente de validação).

## 22. Dependências de ações manuais (dono do projeto)

1. ~~Enviar os cinco Prompts Mestres; confirmar o módulo J~~: resolvido em 2026-11-12.
2. Restabelecer os conectores Railway, Lovable e remote-devices (502 em 2026-11-13). Sem eles: nada de leitura da
   config Railway e do Lovable, nem acesso às 3 demos da pasta Downloads autorizadas no PM6.
3. Autorização específica continua exigida para: reprocessar/backfill de demos reais, mudanças
   destrutivas, segurança, billing e custos relevantes.

## 23. Checkpoints individuais

`docs/checkpoints/FOUNDATION_CHECKPOINT.md` (fundação, concluída) ·
`docs/checkpoints/PHASE_{1..5}_CHECKPOINT.md` · protocolo em `docs/checkpoints/README.md`.
Preexistente e preservado: `docs/A9_1_CONTINUITY_CHECKPOINT.md`.
Documentos de referência: `docs/product/CS2_PRO_PRODUCT_METHODOLOGY.md`,
`docs/product/CS2_PRO_PRODUCT_RESEARCH_AND_BENCHMARKS.md`, `docs/specifications/README.md`,
`docs/foundation/FOUNDATION_REPORT.md` (histórico, não reescrever).

## 24. Como continuar

1. Ler este arquivo; depois só o checkpoint da fase ativa.
2. Conferir: `git fetch && git log --oneline -5 origin/main`; PRs abertos da missão; checks
   do último commit de `main`; `latest_commit_sha` do projeto no Lovable.
3. Se algo divergir daqui, corrigir este arquivo **antes** de continuar.
4. Retomar na "Próxima ação exata". Não repetir o que a tabela de retomada proíbe.

## RESUMO PARA PRÓXIMA SESSÃO

- Projeto: CS2 PRO Hub (`GameProAcademy/cs2-pro-hub`)
- Fase atual: PM1 concluído e validado em produção (heatmaps de morte/eliminação, Dust II validado)
- Estado: PM1 concluído e validado; PM6 em execução (gate de reconciliação feito)
- Última etapa concluída: reconciliação pós-PM1 (`docs/pm6/PM6_POST_PM1_RECONCILIATION.md`)
- Próxima ação: PM6, baseline + pesquisa + benchmark (PR A), depois corpus (PR B)
- Branch: `main`
- Commit: `e2d2bdd6` (merge do #277)
- PR: #256–#277 merged; PM6 PR A aberto
- CI: `main` verde em `e2d2bdd6` (SHA exato)
- Testes pendentes: E2E das telas novas; Score em celular com dados
- Bloqueios: L02/L03/L04; conectores Railway/Lovable/remote-devices indisponíveis (2026-11-13)
- Arquivo central: `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`
- Relatórios por PM: `docs/pm1/`, `docs/pm6/`
- Não repetir: auditorias da fundação; pesquisa de 2026-11-11; leitura da especificação

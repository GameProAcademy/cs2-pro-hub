# CS2 PRO — Checkpoint central de continuidade

> **Primeira leitura de toda retomada.** Depois deste arquivo, abra **somente** o checkpoint
> da fase ativa. Protocolo: `docs/checkpoints/README.md`. Este arquivo não é verdade
> absoluta: confira o estado real do GitHub (seção 24) e corrija-o se divergir.

Atualizado em: 2026-11-13 (America/Sao_Paulo), PM1 + release R5.8.25 · por: sessão Claude
`session_012aG79D5h8yCsYxNjWpDaHG`

Estados usados: CONFIRMADO · IMPLEMENTADO, NÃO VALIDADO · VALIDADO EM TESTE · VALIDADO EM
PRODUÇÃO · PENDENTE · BLOQUEADO · NÃO APLICÁVEL.

## ESTADO EXATO PARA RETOMADA

| Item                               | Valor                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase atual                         | PM1 (Fases 4.2.1 + 4.2.2, Módulos A e B) em execução. Especificação v1.1 e divisão dos 5 Prompts Mestres confirmadas pelo dono (2026-11-12)                                                                                                     |
| Etapa atual                        | PM1 C5: release R5.8.25 (demoparser2 0.42.2) concluída até a atestação; falta H.3-E + validação real da demo de teste. Detalhe em `docs/pm1/PM1_EXECUTION_REPORT.md`                                                                            |
| Última etapa concluída             | R5.8.25: worker `c3593d48` no ar (Railway `d57b9089`, `/version` demoparser2 0.42.2); re-pin #276 merged (`67655b5a`); migration `20261113040000` aplicada e registrada; app publicado; atestação VERIFIED (provenance `841c0bb9`)              |
| Última operação concluída          | Gate H.3-E (run 43363661529): FAIL só em `parser_lock`/`bridge_identity` porque as secrets do app ainda nomeiam `4badf606`/0.42.0 (esperado até o dono trocar)                                                                                  |
| Operações em andamento             | Aguardando o dono recriar 4 secrets do app (`DEMO_PARSER_EXPECTED_REVISION`, `..._BUILD_REVISION`, `H3E91_EXPECTED_WORKER_BUILD_COMMIT`, `DEMO_PARSER_EXPECTED_VERSION`=0.42.2; valores em `docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md` R5.8.25) |
| Processos em execução              | Nenhum                                                                                                                                                                                                                                          |
| Alterações locais não commitadas   | Nenhuma                                                                                                                                                                                                                                         |
| Branch ativa                       | `main` (+ `docs/pm1-r5825-evidence`)                                                                                                                                                                                                            |
| Último commit confirmado em `main` | `67655b5a5ac3f821beb1531778cf7c6afd5d9b95` (merge do #276). #275 → `c3593d48`; #274 → `616c51f8`; #273 → `ea7ed8df`; #272 → `b7272b97`; #271 → `a2ab17a6`; #270 → `e6e507d3`                                                                    |
| Build validado em produção         | `ea7ed8df` (PM1 `/maps`) validado em 2026-11-12 (estado vazio admin; conta de teste 0/7 sem posição); `e60a70f6` (Marco 1)                                                                                                                      |
| Problemas abertos                  | Seção 21; metodologia §20; relatório de fundação §J                                                                                                                                                                                             |
| **Próxima ação exata**             | Depois das secrets: publicar, H.3-E (2 execuções), reenviar a demo de teste autorizada pela conta de teste (tentativa 2 de `ced11a74`, `replacement_reason=raw_audit_blocked`) e validar posições/API/`/maps`/RLS                               |
| Ações que NÃO devem ser repetidas  | Auditorias da fundação; pesquisa de 2026-11-11; mapeamento 4.2; Marco 1; benchmarks spatial-v1/R5.8.25; deploy `d57b9089` (não fazer outro deploy do parser); migration `20261113040000` (já aplicada)                                          |
| Ações manuais necessárias          | Seção 22                                                                                                                                                                                                                                        |

## 1. Identificação

Projeto: CS2 PRO Hub / CS2 PRO AI Coach · Repositório: `GameProAcademy/cs2-pro-hub` ·
Aplicação: https://gamepro.network · Banco e publicação: Lovable Cloud · Parser: Railway.

## 2. Estado atual do projeto

`main` = `b2c8219c` (merge do #262). #260 → `72fb0cdb`; #261 → `106f20c6`; #262 → `b2c8219c`
(último commit do PR `82efb867`, 5 checks verdes, gates de `main` verdes). Fundação publicada (Score
`pro-score-v1`, DNA `dna-weighted-v2`). Especificação 4.2 registrada e mapeada; implementação não iniciada.

## 3. Objetivo da missão vigente

Missão de fundação: CONCLUÍDA. Protocolo de continuidade: IMPLANTADO (#260 merged em `72fb0cdb`;
#261 merged em `106f20c6`). Missão de
metodologia (2026-11-11): três decisões de produto, pesquisa, metodologia oficial e dependência da
especificação 4.2 documentadas — **sem alteração de código, banco, parser ou produção**. Próxima:
registrar e mapear a especificação mestre da Fase 4.2 (recebida, não processada).

## 4–5. Fase 4.2: entregas, módulos, Prompts Mestres e fases do protocolo

- Especificação original: `docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre.md`
  (byte a byte, SHA-256 `989ec11f…`). Mapeamento: `docs/specifications/FASE_4_2_MAPEAMENTO.md`.
- **10 entregas** `4.2.1`–`4.2.10` e **módulos** `A`–`J`: confirmados no original (§8, §9, §34).
- **Cinco Prompts Mestres: NÃO definidos no original** (fato verificado). PM4/PM5 só existem como
  referência histórica dos prompts do dono; PM1–PM3 desconhecidos; agrupamento por pares é
  hipótese. J aparece em 4.2.8 e 4.2.10.
- **Fases 1–5 deste protocolo**: continuam PENDENTE DE CONFIRMAÇÃO até o dono enviar ou confirmar
  os cinco Prompts Mestres. O trabalho da missão de evolução é registrado por **Marco** (0–7).

| Fase | Nome / escopo           | Situação | Checkpoint                          |
| ---- | ----------------------- | -------- | ----------------------------------- |
| 1    | PENDENTE DE CONFIRMAÇÃO | PENDENTE | `checkpoints/PHASE_1_CHECKPOINT.md` |
| 2    | PENDENTE DE CONFIRMAÇÃO | PENDENTE | `checkpoints/PHASE_2_CHECKPOINT.md` |
| 3    | PENDENTE DE CONFIRMAÇÃO | PENDENTE | `checkpoints/PHASE_3_CHECKPOINT.md` |
| 4    | PENDENTE DE CONFIRMAÇÃO | PENDENTE | `checkpoints/PHASE_4_CHECKPOINT.md` |
| 5    | PENDENTE DE CONFIRMAÇÃO | PENDENTE | `checkpoints/PHASE_5_CHECKPOINT.md` |

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

Suíte local com PostgreSQL descartável após #258: 2311 aprovados, 1 ignorado, 0 falhas.
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

PRs abertos antigos (#7–#161, fora desta missão): não tocados; alguns são autorizações H.3-E
do dono. Não fazer merge nem fechar sem instrução.

## 18. Estado do CI

`main` `e60a70f6`: Quality Gates, Queue Semantics Probe, R5.8.3, R5.8.4, F553 pós-conclusão e
H.3-E (2ª execução) — todos `success`. CONFIRMADO em 2026-11-12.

## 19. Publicação e deploy

Publicado via `deploy_project` do Lovable; build servido validado por comportamento em
`f1276859`. VALIDADO EM PRODUÇÃO (validação própria nos dois navegadores em 2026-11-10/11).
`13cfcde8`, `72fb0cdb`, `106f20c6` e o lote de metodologia são documentação: NÃO APLICÁVEL.

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
9. Posições: o parser extrai `X/Y/Z` mas desbasta uniformemente até 4.096 linhas e o app persiste
   só contagens; produção sem posições (metodologia §11.1).
10. `L04-MATCH-RESULT-UNRESOLVED` bloqueia identidade de time, placar e resultado da partida. O
    lado vencedor do round **existe** e foi validado (mapeamento §4) — correção de 2026-11-12.
11. `L02` (domínio de ticks) e `L03` (usercmd) restringem densidade/replay/movimento e
    mira/counter-strafe da 4.2 (mapeamento §4).
12. Não existe mecanismo de feature flag, embora a especificação mande reutilizá-lo.
13. Dependências transitivas do parser não fixadas (pandas, numpy, polars, pyarrow): os builds de 2026-11-12/13 resolveram pandas 3.1.1 / numpy 2.5.4; saída conferida idêntica na demo de benchmark. Fixá-las é uma mudança de runtime a decidir.
14. demoparser2 0.42.0 não lê demos atuais do CS2 (`EntityNotFound`); por isso a R5.8.25 (0.42.2). O parser de navegador A9.1 continua WASM 0.42.0 (fora de produção).
15. `_EVENT_OTHER_PROPS` do parser nunca chegou às linhas de produção (pendente de validação).

## 22. Dependências de ações manuais (dono do projeto)

1. Enviar os cinco Prompts Mestres ou confirmar o agrupamento hipotético (mapeamento §1, §12).
2. Confirmar a qual PM pertence o módulo J.
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
- Fase atual: missão de evolução estrutural; Marcos 0 e 1 concluídos; 4.2.1 e Marco 2 camada A merged
- Estado: especificação mapeada; round-context-v1 validado em produção
- Última etapa concluída: Marco 1 publicado e validado (`e60a70f6`)
- Próxima ação: secrets do dono → publicar → H.3-E → reenviar a demo de teste → validação real das posições
- Branch: `main`
- Commit: `67655b5a` (merge do #276)
- PR: #256–#276 merged
- CI: `main` verde em `e60a70f6`
- Testes pendentes: E2E das telas novas; Score em celular com dados
- Bloqueios: cinco PMs não definidos no original; L02/L03/L04
- Arquivo central: `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`
- Checkpoint da fase: mapeamento 4.2 (fases 1–5 pendentes)
- Não repetir: auditorias da fundação; pesquisa de 2026-11-11; leitura da especificação

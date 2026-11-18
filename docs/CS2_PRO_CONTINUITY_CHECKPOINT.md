# CS2 PRO — Checkpoint central de continuidade

> **Primeira leitura de toda retomada.** Depois deste arquivo, abra **somente** o checkpoint
> da fase ativa. Protocolo: `docs/checkpoints/README.md`. Este arquivo não é verdade
> absoluta: confira o estado real do GitHub (seção 24) e corrija-o se divergir.

Atualizado em: 2026-11-17 (America/Sao_Paulo) — PM4 ATIVO (C5) · por: sessão Claude
`session_012aG79D5h8yCsYxNjWpDaHG`

Estados usados: CONFIRMADO · IMPLEMENTADO, NÃO VALIDADO · VALIDADO EM TESTE · VALIDADO EM
PRODUÇÃO · PENDENTE · BLOQUEADO · NÃO APLICÁVEL · HISTÓRICO (registro de uma data passada, não o estado atual).

## ESTADO EXATO PARA RETOMADA

| Item                               | Valor                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase atual                         | **PM4 (Fases 4.2.7 e 4.2.8, módulos E, F, G e a parte histórico/DNA de J): ATIVA** desde 2026-11-17. PM1, PM6, PM2 e PM3 concluídos. PM5 não iniciado                        |
| Etapa atual                        | C5 (release) em andamento                                                                                                                                                    |
| Última etapa concluída             | Worker R5.8.31 (`584ea563`, `0c646583`) em produção; migration `20261117235000` aplicada; app publicado em `1b4bd82f` com `/rounds`; attestation 44207611056 success         |
| Operações em andamento             | CI do #322 (módulo G)                                                                                                                                                        |
| Branch ativa                       | `feat/pm4-module-g-evolution` (#322), `feat/pm4-coach-rounds-evolution`, `docs/pm4-checkpoint`                                                                               |
| Último commit confirmado em `main` | `1b4bd82f` (merge do #320)                                                                                                                                                   |
| Build validado em produção         | App: publicação de `1b4bd82f`. Worker: Railway `584ea563`, `0c646583` (R5.8.31), Source persistente `0c646583`; `/version` `git:0c646583…`, `declared_revision_matches` true |
| Gates mais recentes                | #319, #320, #321: todos os checks obrigatórios verdes no SHA exato; attestation 44207611056 success; H.3-E pendente dos secrets                                              |
| Problemas abertos                  | Secrets do app ainda em R5.8.30 (MANUAL_REQUIRED); amostra de produção ≤ 5 partidas por jogador                                                                              |
| **Próxima ação exata**             | Dono troca os 3 secrets → H.3-E → merge #322 e PR Coach/E2E → publicar → E2E → demo nova da conta A → C6                                                                     |
| Ações que NÃO devem ser repetidas  | Tudo do PM1–PM3; release R5.8.31 (`584ea563`) e migration `20261117235000`                                                                                                   |
| Ações manuais necessárias          | `DEMO_PARSER_EXPECTED_REVISION`, `DEMO_PARSER_EXPECTED_BUILD_REVISION`, `H3E91_EXPECTED_WORKER_BUILD_COMMIT` → `0c646583…`                                                   |

Checkpoint e relatório vivo da fase ativa: `docs/pm4/PM4_CHECKPOINT.md` e `docs/pm4/PM4_REPORT.md` (PM3 concluído: `docs/pm3/`).

## 1. Identificação

Projeto: CS2 PRO Hub / CS2 PRO AI Coach · Repositório: `GameProAcademy/cs2-pro-hub` ·
Aplicação: https://gamepro.network · Banco e publicação: Lovable Cloud (projeto `91478977-…`; a conta Supabase pessoal
vazia **não** é o banco de produção) · Parser: Railway (`cs2-demo-parser`).

## 2. Estado atual do projeto

- `main` = `1b4bd82f` (2026-11-17). HISTÓRICO: `ad7b73b2` era o último funcional do PM3; `10e90693` (#318) foi o fechamento documental.
- Fundação publicada: Score `pro-score-v1` e DNA `dna-weighted-v2`.
- **PM1** (4.2.1–4.2.2): concluído e validado em produção (`docs/pm1/PM1_EXECUTION_REPORT.md`).
- **PM6** (compatibilidade de demos, integridade de partida, nicks, segurança): **concluído** em 2026-11-14 (#290 `66d4af1d`; `docs/pm6/PM6_FINAL_REPORT.md` §11, "pronto para o PM2, com ressalvas classificadas").
- **PM2** (4.2.3–4.2.4, módulos B e I): **COMPLETE** em 2026-11-17 (`docs/pm2/PM2_FINAL_REPORT.md` §30).
- Parser em produção: R5.8.31 (`0c646583`, demoparser2 0.42.2; Railway `584ea563`). HISTÓRICO: R5.8.30 `768646ea` / `3335c88d`.
- **PM3** (4.2.5–4.2.6, módulos C e D): **concluído** em 2026-11-17 (`docs/pm3/PM3_REPORT.md` C6, #318 `10e90693`).
- **PM4** (4.2.7–4.2.8, módulos E, F, G e histórico/DNA de J): **ativo** desde 2026-11-17 (`docs/pm4/`).

## 3. Objetivo da missão vigente

**Missão vigente: PM4**, Fases 4.2.7 (economia e impacto por round; módulos E e F) e 4.2.8 (evolução e consistência;
módulo G, com a parte histórico/DNA do módulo J), até produção, nos 5 idiomas, com métricas só quando a telemetria as
sustenta. Prompt: Prompt Mestre 4 atualizado em 2026-11-17 (o adendo prevalece). Comparativos Pro/coortes ficam no PM5. Limites:

- nenhum prompt ao agente Lovable;
- nenhum reprocessamento em massa;
- nada de Tutor LMS;
- Coach continua em OpenRouter `openai/gpt-oss-20b`, sem fallback.

Missões concluídas: fundação; protocolo de continuidade (#260, #261); metodologia (2026-11-11); mapeamento 4.2 (#263);
PM1 (#264–#277); PM6 (#278–#290); PM2 (#291–#308); PM3 (#309–#318).

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
- Os arquivos `checkpoints/PHASE_*` ficam como histórico. O estado por PM vive em
  `docs/pm1/`, `docs/pm6/`, `docs/pm2/` e `docs/pm3/`.

| Fase    | Nome / escopo                    | Situação                             | Checkpoint                          |
| ------- | -------------------------------- | ------------------------------------ | ----------------------------------- |
| 1 (PM1) | 4.2.1–4.2.2, módulos A e B       | CONCLUÍDA, validada em produção      | `pm1/PM1_EXECUTION_REPORT.md`       |
| PM6     | Compatibilidade de demos         | CONCLUÍDA (2026-11-14, #290)         | `pm6/PM6_FINAL_REPORT.md`           |
| 2 (PM2) | 4.2.3–4.2.4, módulos B e I       | COMPLETE (2026-11-17; relatório §30) | `pm2/PM2_FINAL_REPORT.md`           |
| 3 (PM3) | 4.2.5–4.2.6, módulos C e D       | CONCLUÍDA (2026-11-17, #318)         | `pm3/PM3_CHECKPOINT.md`             |
| 4 (PM4) | 4.2.7–4.2.8, módulos E, F, G e J | ATIVA (autorizada em 2026-11-17)     | `pm4/PM4_CHECKPOINT.md`             |
| 5 (PM5) | 4.2.9–4.2.10, módulos H, I e J   | PENDENTE                             | `checkpoints/PHASE_5_CHECKPOINT.md` |

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

- PM2 (2026-11-17):
  - vitest 685/685 nas suítes de UI/lib tocadas;
  - `pytest scripts/tests scripts/ci` 461;
  - E2E de browser em produção 12/12 (run 44062163308): contas A e B, isolamento A→B e B→A, regressão dos formulários de autenticação.
  - Detalhe: relatório PM2 §28–§30.
- HISTÓRICO, PM1/R5.8.25: worker 554, scripts 423, vitest com cerca de 2.360 aprovados; CI verde no SHA exato de cada PR e em `e2d2bdd6`.
- HISTÓRICO, fundação: 2311 aprovados, 1 ignorado, 0 falhas.

## 15. Testes pendentes

Do PM3, a definir no plano C2 (`docs/pm3/`). Herdados: tabela do Score em celular com dados reais; idiomas ≠ pt-BR verificados em
produção (o E2E roda em pt-BR).

## 16–17. Branches, commits e PRs

| PR                                                                             | Branch                                                           | Merge em `main`       | Estado                                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| #256 DNA v2                                                                    | `fix/player-dna-v2`                                              | `0ebfedf2`            | merged                                                          |
| #257 Score v1                                                                  | `feat/pro-score-v1`                                              | `975c7d11`            | merged                                                          |
| #258 Coach/Score                                                               | `fix/coach-score-facts`                                          | `f1276859`            | merged                                                          |
| #259 Relatório de fundação                                                     | `docs/foundation-report`                                         | `13cfcde8`            | merged                                                          |
| #260 Protocolo de continuidade                                                 | `docs/continuity-checkpoints`                                    | `72fb0cdb`            | merged                                                          |
| #261 Checkpoint pós-#260                                                       | `docs/continuity-after-260`                                      | `106f20c6`            | merged                                                          |
| #262 Metodologia                                                               | `docs/product-methodology`                                       | `b2c8219c`            | merged (PR `82efb867`, 5 checks verdes)                         |
| #263 Marco 0 Mapeamento 4.2                                                    | `docs/fase-4-2-mapping`                                          | `bf57069e`            | merged, gates verdes                                            |
| #264 Marco 1 round-context-v1                                                  | `feat/round-context-v1`                                          | `e60a70f6`            | merged, gates verdes, publicado e validado                      |
| #265 Textos do Raio-X                                                          | `fix/xray-side-copy`                                             | `f4460123`            | merged                                                          |
| #266 4.2.1 metric-contract-v1                                                  | `feat/metric-contract-v1`                                        | `4c6f5067`            | merged, gates verdes                                            |
| #267 spatial-v1 camada A (parser)                                              | `feat/spatial-v1-event-positions`                                | `4badf606`            | merged; release R5.8.24 concluída (#268/#269)                   |
| #270–#273 PM1 A–D                                                              | `feat/pm1-*`                                                     | `e6e507d3`…`ea7ed8df` | merged, publicados (`/maps`)                                    |
| #274 Polimento do heatmap                                                      | `fix/pm1-heatmap-ui-polish`                                      | `616c51f8`            | merged                                                          |
| #275 demoparser2 0.42.2 (R5.8.25)                                              | `release/r5-8-25-demoparser2-0422`                               | `c3593d48`            | merged; worker no ar (`d57b9089`)                               |
| #276 Re-pin R5.8.25                                                            | `release/r5-8-25-repin`                                          | `67655b5a`            | merged; migration aplicada; atestação VERIFIED                  |
| #277 Evidência PM1 / matriz                                                    | `docs/pm1-r5825-evidence`                                        | `e2d2bdd6`            | merged; CI verde em `e2d2bdd6`                                  |
| #278 PM6 PR A Reconciliação/corpus                                             | `docs/pm6-a-reconciliation`                                      | `0bdb2719`            | merged, 5/5 verde                                               |
| #279 PM6 PR F Revisão FACEIT/GC                                                | `fix/pm6-f-faceit-gc-event-review`                               | `7e84f6da`            | merged; worker no ar (`2f0e6812`, R5.8.26)                      |
| #280 PM6 PR B Harness                                                          | `feat/pm6-b-compat-harness`                                      | `3b7680b9`            | merged, 5/5 verde                                               |
| #281 PM6 checkpoint                                                            | `docs/pm6-checkpoint-after-278-280`                              | `ba6e6016`            | merged                                                          |
| #282 Re-pin R5.8.26                                                            | `release/r5-8-26-repin`                                          | `90689c95`            | merged, 7/7; migration aplicada; atestação VERIFIED; H.3-E PASS |
| #283–#290 PM6 (docs, segurança, integridade, nicks, R5.8.27, relatório final)  | `docs/pm6-*`, `fix/pm6-*`, `feat/pm6-*`, `release/r5-8-27-repin` | `8f6e915f`…`66d4af1d` | merged (#290 fecha o PM6)                                       |
| #291–#297 PM2 (C0–C2, death context/review, replay, Coach, R5.8.28, relatório) | `docs/pm2-*`, `feat/pm2-*`, `release/r5-8-28-repin`              | `ed124279`…`883f68e2` | merged                                                          |
| #298 `/maps` com parâmetros extras                                             | `fix/maps-unknown-search-params`                                 | `3eee0480`            | merged                                                          |
| #299 Radar de 5 mapas validado                                                 | `feat/validate-radar-five-maps`                                  | `e04893ab`            | merged                                                          |
| #300 Morte de BOT substituído (FACEIT)                                         | `fix/faceit-bot-replacement-world-deaths`                        | `47ba6ffe`            | merged; worker R5.8.29 (`3375b68b`)                             |
| #301 Re-pin R5.8.29                                                            | `release/r5-8-29-repin`                                          | `76fa4887`            | merged; migration aplicada; atestação success; H.3-E PASS       |
| #302 Docs PM2 (replay em produção)                                             | `docs/pm2-replay-production-validation`                          | `e20a7459`            | merged                                                          |
| #303 E2E de browser + hook de estado do replay                                 | `test/replay-state-hook`                                         | `6d3b91d7`            | merged                                                          |
| #304 Workflow do E2E                                                           | `fix/pm2-e2e-workflow`                                           | `226e37ce`            | merged                                                          |
| #305 Reautenticação da troca de senha (outra sessão)                           | `fix/password-reauthentication-resend`                           | `c82bbf8a`            | merged                                                          |
| #306 Credenciais nunca na URL (formulários de autenticação)                    | `fix/auth-forms-no-credentials-in-url`                           | `d68a82db`            | merged; publicado (`0719c851`); validado em produção            |
| #307 E2E: hidratação + guard de credenciais                                    | `fix/pm2-e2e-login-hydration`                                    | `b0452747`            | merged; E2E 12/12                                               |
| #308 Fechamento do PM2                                                         | `docs/pm2-closure-e2e-idor`                                      | `ab2d83c6`            | merged                                                          |
| #309 Reconciliação do checkpoint (PM3-0)                                       | `docs/pm3-checkpoint-reconcile`                                  | `6031b334`            | merged                                                          |
| #310 Telemetria PM3 (R5.8.30)                                                  | `feat/pm3-telemetry-r5-8-30`                                     | `768646ea`            | merged; worker R5.8.30 (`3335c88d`)                             |
| #311 Módulo C `/duels` (`cs2.duels.v1`)                                        | `feat/pm3-module-c-duels`                                        | `7f1d8852`            | merged; não publicado                                           |
| #312 Re-pin R5.8.30                                                            | `release/r5-8-30-repin`                                          | `4cacaf5c`            | merged; migration aplicada; atestação pendente (secrets)        |
| #313 Módulo D `/utility` (`cs2.utility.v1`)                                    | `feat/pm3-module-d-utility`                                      | `afa58592`            | merged; não publicado                                           |
| #314 `Server-Timing` do replay                                                 | `perf/replay-server-timing`                                      | `5ad16f13`            | merged; não publicado                                           |
| #315 Coach C/D + E2E `/duels` `/utility`                                       | `feat/pm3-coach-combat-utility`                                  | —                     | aberto, CI                                                      |

PRs abertos antigos (#7–#161, fora desta missão): não tocados; alguns são autorizações H.3-E
do dono. Não fazer merge nem fechar sem instrução.

## 18. Estado do CI

Atual: ver "Gates mais recentes" na tabela de retomada. Padrão conhecido: a H.3-E dispara cedo em todo merge e falha com
`RUN_NOT_COMPLETED` enquanto os Quality Gates rodam; a execução seguinte, depois do F553, passa (§21 item 5).

HISTÓRICO:

- `e2d2bdd6` (2026-11-13): gates verdes; H.3-E PASS 18/18 (43377084815).
- R5.8.26: #282 7/7; atestação 43523117499; H.3-E PASS (43523214027).

## 19. Publicação e deploy

- App atual: publicação `0719c851` de `d68a82db` (2026-11-17). Validado em produção (relatório PM2 §29): `/login` com
  `method="post"` e `fieldset disabled` antes da hidratação.
- Worker atual: Railway `3375b68b` (`47ba6ffe`, R5.8.29). Source persistente alinhado; o `4716f894` do §21 item 10 está resolvido.
- Publicação do app pelo conector (`deploy_project`):
  - **HISTÓRICO:** a regra do PM6 §14 (2026-11-13) deixava a publicação como ação manual do dono.
  - No PM2, o dono autorizou publicar pelo conector.
  - O Prompt Mestre 3 atualizado autoriza publicar e fazer deploy após os gates.
  - Publicação nunca é feita pelo agente Lovable.

HISTÓRICO: app `67655b5a` e `e2d2bdd6` (2026-11-13); worker `d57b9089` (`c3593d48`).

## 20. Gates de segurança e critérios não comprovados

Inalterados e preservados: RLS, ownership, autenticação, autorização no servidor, admin
master, rate limits, idempotência, leases, reservations, response guards, parser identity,
build pin, H.3-E, runtime attestation, gates de ativação. Coach: OpenRouter
`openai/gpt-oss-20b`, sem fallback. Não comprovado: logs do servidor de produção.

## 21. Riscos e limitações conhecidas

1. Índices por dimensão do DNA não calibrados (regra "< 60" do Raio-X e prioridade de treino).
2. Pesos do Score não ajustados estatisticamente.
3. Posições: o parser no ar (R5.8.29) emite posição do atacante e da vítima no tick da morte e trajetórias por round
   (`cs2.round-trajectory.v1`, a cada 16 ticks, desde R5.8.28). Partidas antigas continuam sem essas posições (nada reprocessado).
4. `buy_context` e `survived` vazios em `round_players`; `weapon_fire` sem autor.
5. H.3-E Activation Gate falha na 1ª execução de todo merge e passa na 2ª.
6. `gate1d.test.ts` estourou 5 s uma vez no CI (hipótese: carga do runner).
7. Amostra de produção mínima (3 perfis, 6 partidas, 5 linhas de features).
8. Constantes de normalização do DNA (ex.: ÷120, ÷12, ÷0,4, ÷2,5, rating ÷1,6) funcionam como
   escalas de referência sem fonte (metodologia §3.2).
9. Posições contínuas: desde R5.8.28 há trajetórias por round, só xyz e vivo/morto, sem ângulos de visão nem velocidade.
   Exposição e isolamento continuam NOT_SUPPORTED (relatório PM2 §16).
10. HISTÓRICO (resolvido no R5.8.28/R5.8.29): o Source persistente da Railway apontava `4716f894`. Hoje aponta o commit
    da release ativa (`47ba6ffe`). Releases usam troca de Source + um único build (relatório PM2 §1).
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
18. Alerta de segurança do Lovable no publish de 2026-11-13 (dono publicou com "Atualizar mesmo assim"). Triagem
    read-only (`pg_policies`, 2026-11-13 ~23:00Z), sem alteração:
    - Crítico "storage não liga arquivos ao dono" (3 políticas). Hipótese mais provável: as 3 políticas
      `r5_forensic_staging_objects_master_{insert,select,update}`. São restritas a `is_admin_master` e a **um** objeto
      de nome fixo no bucket privado `r5-forensic-staging`, e vêm de 2026-09-22/23 (`0cbcd5c4`, `e52450fd`). `demos_*` e
      `avatars_*` exigem pasta = `auth.uid()` (exceção de staff/admin só em SELECT). Todos os buckets são privados.
      Não há evidência de qual política o scanner apontou.
    - Aviso "5 tabelas com acesso liberado": `lessons`, `lesson_skills`, `lesson_translations`, `skills`, `skill_translations`
      têm SELECT `true` para `public` (catálogo de aulas). As demais políticas `true` são de `service_role`.
    - Nenhuma política de storage ou dessas tabelas foi tocada pela R5.8.26 (só a migration `20261113213000`, em duas funções).
    - Mudar isso altera RLS/autorização: exige decisão do dono. Não usar "Tentar corrigir" do Lovable (PM6 proíbe operar o agente).

## 22. Dependências de ações manuais (dono do projeto)

1. ~~Enviar os cinco Prompts Mestres; confirmar o módulo J~~: resolvido em 2026-11-12.
2. HISTÓRICO: conectores Railway, Lovable e remote-devices restabelecidos (usados no PM2 em 2026-11-14/17).
3. Autorização específica continua exigida para: reprocessar/backfill de demos reais, mudanças
   destrutivas, segurança, billing e custos relevantes.

4. **PM2 (feito em 2026-11-17):** duas contas reais de teste, A e B, e os 4 secrets `PM2_E2E_*`. Troca da senha da conta A
   (exposta na URL na run 44035115612, antes do #306): **confirmada pelo dono** em 2026-11-17. Nenhum segredo registrado.

5. **PM3 / R5.8.30 (feito em 2026-11-17):** nos secrets do app (Lovable → Cloud → Secrets):
   `DEMO_PARSER_EXPECTED_REVISION` = `DEMO_PARSER_EXPECTED_BUILD_REVISION` = `git:768646ea76646219b1749f9fd2e757703292a24c`;
   `H3E91_EXPECTED_WORKER_BUILD_COMMIT` = `768646ea76646219b1749f9fd2e757703292a24c`. Depois: uma demo nova de FACEIT ou GC
   (HLTV não traz `player_blind`) enviada pela conta A, para validar C/D em produção.

## 22-A. Estado do PM2 no fechamento (2026-11-17, HISTÓRICO)

| Item                | Estado                                                                                                                              | Evidência                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| PRs                 | #291–#308 merged (fechamento: #302 `e20a7459`, #303 `6d3b91d7`, #304 `226e37ce`, #306 `d68a82db`, #307 `b0452747`, #308 `ab2d83c6`) | GitHub                        |
| Railway / release   | R5.8.29: deployment `3375b68b` SUCCESS (`4ef83d14` SKIPPED pelo freeze; `bb92ed95` REMOVED)                                         | `list-deployments` 2026-11-17 |
| Runtime identity    | `git:47ba6ffe…` nos 2 hosts, demoparser2 0.42.2, `declared_revision_matches` true                                                   | `/version` 2026-11-17         |
| Atestação / H.3-E   | run 44013092142 success; H.3-E PASS 18/18 em `76fa4887`                                                                             | Actions                       |
| Demo FACEIT Nuke    | job `93450453` processado, 181 kills, 0 kills sem vítima                                                                            | relatório §24, §26            |
| Replay em produção  | VALIDADO: 24/24 rounds, 7274 amostras, play/pause, deep link de `/deaths`                                                           | relatório §5, §26             |
| Mapas               | VALIDATED: Dust2, Mirage, Inferno, Nuke, Ancient, Anubis e Cache. NOT_VALIDATED: Overpass, Train e Vertigo                          | relatório §22                 |
| Pendências formais  | nenhuma. IDOR em dois sentidos e E2E de browser 12/12 em produção (run 44062163308)                                                 | relatório §28, §30            |
| Riscos residuais    | latência do segmento de 2,7–3,0 s (hipótese em §27); alerta de segurança do Lovable NOT_VERIFIED; etapa E DEFERRED                  | relatório §16, §21, §25, §27  |
| Decisão / sequência | PM2 COMPLETE; PM3 autorizado em 2026-11-17 e ativo; a latência entra no PM3 como item de observabilidade                            | relatório §20, §30            |

## 23. Checkpoints individuais

`docs/pm3/PM3_CHECKPOINT.md` (fase ativa) · `docs/checkpoints/FOUNDATION_CHECKPOINT.md` (fundação, concluída) ·
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
- Fase atual: nenhuma ativa. PM1, PM6, PM2 e **PM3 concluídos**; PM4/PM5 aguardam autorização
- Produção: app de `ad7b73b2`; worker R5.8.30 (`3335c88d`, `768646ea`)
- Última etapa: PM3 C6 (relatório `docs/pm3/PM3_REPORT.md`)
- Próxima ação: aguardar instrução do dono
- Commit: `main` `ad7b73b2`
- Bloqueios: nenhum
- Arquivo central: este. Relatórios: `docs/pm1/`, `docs/pm6/PM6_FINAL_REPORT.md`, `docs/pm2/PM2_FINAL_REPORT.md`, `docs/pm3/PM3_REPORT.md`
- Não repetir: ver a tabela de retomada

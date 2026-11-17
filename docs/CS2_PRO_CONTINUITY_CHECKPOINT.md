# CS2 PRO — Checkpoint central de continuidade

> **Primeira leitura de toda retomada.** Depois deste arquivo, abra **somente** o checkpoint
> da fase ativa. Protocolo: `docs/checkpoints/README.md`. Este arquivo não é verdade
> absoluta: confira o estado real do GitHub (seção 24) e corrija-o se divergir.

Atualizado em: 2026-11-14 (America/Sao_Paulo), PM2 v2 — C3–C6 · por: sessão Claude
`session_012aG79D5h8yCsYxNjWpDaHG`

Estados usados: CONFIRMADO · IMPLEMENTADO, NÃO VALIDADO · VALIDADO EM TESTE · VALIDADO EM
PRODUÇÃO · PENDENTE · BLOQUEADO · NÃO APLICÁVEL.

## ESTADO EXATO PARA RETOMADA

| Item                               | Valor                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase atual                         | **PM2 v2: fechamento (Etapa A do Prompt Mestre 3).** O PM3 (4.2.5–4.2.6, módulos C e D) NÃO foi iniciado e depende de autorização explícita                                                                                                                                                                                                           |
| Etapa atual                        | Fechamento do PM2: PR #302 (docs), IDOR em dois sentidos (MANUAL_REQUIRED: falta a segunda conta real e as credenciais em secrets), E2E de browser (Playwright, em preparação). Replay VALIDADO EM PRODUÇÃO (relatório §5, §26). Veredito **PARCIAL**                                                                                                 |
| Última etapa concluída             | Release R5.8.29: #300 `47ba6ffe` (morte de BOT substituído em FACEIT) → Source alinhado a `47ba6ffe` (`4ef83d14` SKIPPED) → único build `3375b68b` → `/version` nos 2 hosts → re-pin #301 `76fa4887` (dry-run, aplicação e registro da migration) → secrets trocados pelo dono → publicação `99590af9` → atestação run 44013092142 → H.3-E PASS 18/18 |
| Última operação concluída          | Validação do replay em produção com `demo-faceit-nuke.dem` enviada pelo dono: job `93450453` processado, trajetória COMPLETE 24/24, `/replay` round 3 desenhado (2500/2500 amostras, play/pause), deep link de `/deaths` para o tick 14552, `NOT_RECORDED` na partida antiga, nenhum SteamID no DOM                                                   |
| Operações em andamento             | PR #302 em revisão; E2E de browser em preparação                                                                                                                                                                                                                                                                                                      |
| Processos em execução              | Nenhum                                                                                                                                                                                                                                                                                                                                                |
| Alterações locais não commitadas   | Nenhuma                                                                                                                                                                                                                                                                                                                                               |
| Branch ativa                       | `main`                                                                                                                                                                                                                                                                                                                                                |
| Último commit confirmado em `main` | `76fa4887` (merge do #301). #300 → `47ba6ffe`; #299 → `e04893ab`; #298 → `3eee0480`; #297 → `883f68e2`. O #302 (docs) só entra depois de CI verde no SHA exato                                                                                                                                                                                        |
| Build validado em produção         | App: `76fa4887` (publicação `99590af9`). Worker: Railway `3375b68b` SUCCESS, commit `47ba6ffe`, Source persistente `47ba6ffe`. `/version` nos 2 hosts (reconferido em 2026-11-17 ~05:20Z): `git:47ba6ffe…`, demoparser2 0.42.2, `declared_revision_matches` true. Atestação run 44013092142 success; H.3-E PASS 18/18 (run 44005644742)               |
| Problemas abertos                  | PM2 relatório §28: IDOR em dois sentidos MANUAL_REQUIRED; E2E de browser PENDENTE. Também: latência do segmento do replay (§27, item do PM3); Overpass/Train/Vertigo NOT_VALIDATED; alerta de segurança do Lovable NOT_VERIFIED; etapa E DEFERRED                                                                                                     |
| **Próxima ação exata**             | Dono: criar a conta de teste B (com uma partida processada), decidir a conta A e cadastrar os secrets `PM2_E2E_A_EMAIL`, `PM2_E2E_A_PASSWORD`, `PM2_E2E_B_EMAIL` e `PM2_E2E_B_PASSWORD`. Depois: rodar o E2E e o IDOR, atualizar o relatório §28 e decidir PM2 COMPLETE/PARTIAL. NÃO iniciar o PM3 sem autorização                                    |
| Ações que NÃO devem ser repetidas  | Tudo do PM6; PM2 #291–#301; releases R5.8.28 e R5.8.29; migrations até `20261114230000`; validação dos 7 mapas; testes de corpus do PM2; validação do replay em produção                                                                                                                                                                              |
| Ações manuais necessárias          | Seção 22 e relatório PM2 §17                                                                                                                                                                                                                                                                                                                          |

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

| Fase    | Nome / escopo                    | Situação                                        | Checkpoint                           |
| ------- | -------------------------------- | ----------------------------------------------- | ------------------------------------ |
| 1 (PM1) | 4.2.1–4.2.2, módulos A e B       | CONCLUÍDA, validada em produção                 | `pm1/PM1_EXECUTION_REPORT.md`        |
| PM6     | Compatibilidade de demos         | EM EXECUÇÃO                                     | `pm6/PM6_POST_PM1_RECONCILIATION.md` |
| 2 (PM2) | 4.2.3–4.2.4, módulos B e I       | PARCIAL (publicado; falta replay com demo nova) | `pm2/PM2_FINAL_REPORT.md`            |
| 3 (PM3) | 4.2.5–4.2.6, módulos C e D       | PENDENTE                                        | `checkpoints/PHASE_3_CHECKPOINT.md`  |
| 4 (PM4) | 4.2.7–4.2.8, módulos E, F, G e J | PENDENTE                                        | `checkpoints/PHASE_4_CHECKPOINT.md`  |
| 5 (PM5) | 4.2.9–4.2.10, módulos H, I e J   | PENDENTE                                        | `checkpoints/PHASE_5_CHECKPOINT.md`  |

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

| PR                                 | Branch                              | Merge em `main`       | Estado                                                          |
| ---------------------------------- | ----------------------------------- | --------------------- | --------------------------------------------------------------- |
| #256 DNA v2                        | `fix/player-dna-v2`                 | `0ebfedf2`            | merged                                                          |
| #257 Score v1                      | `feat/pro-score-v1`                 | `975c7d11`            | merged                                                          |
| #258 Coach/Score                   | `fix/coach-score-facts`             | `f1276859`            | merged                                                          |
| #259 Relatório de fundação         | `docs/foundation-report`            | `13cfcde8`            | merged                                                          |
| #260 Protocolo de continuidade     | `docs/continuity-checkpoints`       | `72fb0cdb`            | merged                                                          |
| #261 Checkpoint pós-#260           | `docs/continuity-after-260`         | `106f20c6`            | merged                                                          |
| #262 Metodologia                   | `docs/product-methodology`          | `b2c8219c`            | merged (PR `82efb867`, 5 checks verdes)                         |
| #263 Marco 0 Mapeamento 4.2        | `docs/fase-4-2-mapping`             | `bf57069e`            | merged, gates verdes                                            |
| #264 Marco 1 round-context-v1      | `feat/round-context-v1`             | `e60a70f6`            | merged, gates verdes, publicado e validado                      |
| #265 Textos do Raio-X              | `fix/xray-side-copy`                | `f4460123`            | merged                                                          |
| #266 4.2.1 metric-contract-v1      | `feat/metric-contract-v1`           | `4c6f5067`            | merged, gates verdes                                            |
| #267 spatial-v1 camada A (parser)  | `feat/spatial-v1-event-positions`   | `4badf606`            | merged; release R5.8.24 concluída (#268/#269)                   |
| #270–#273 PM1 A–D                  | `feat/pm1-*`                        | `e6e507d3`…`ea7ed8df` | merged, publicados (`/maps`)                                    |
| #274 Polimento do heatmap          | `fix/pm1-heatmap-ui-polish`         | `616c51f8`            | merged                                                          |
| #275 demoparser2 0.42.2 (R5.8.25)  | `release/r5-8-25-demoparser2-0422`  | `c3593d48`            | merged; worker no ar (`d57b9089`)                               |
| #276 Re-pin R5.8.25                | `release/r5-8-25-repin`             | `67655b5a`            | merged; migration aplicada; atestação VERIFIED                  |
| #277 Evidência PM1 / matriz        | `docs/pm1-r5825-evidence`           | `e2d2bdd6`            | merged; CI verde em `e2d2bdd6`                                  |
| #278 PM6 PR A Reconciliação/corpus | `docs/pm6-a-reconciliation`         | `0bdb2719`            | merged, 5/5 verde                                               |
| #279 PM6 PR F Revisão FACEIT/GC    | `fix/pm6-f-faceit-gc-event-review`  | `7e84f6da`            | merged; worker no ar (`2f0e6812`, R5.8.26)                      |
| #280 PM6 PR B Harness              | `feat/pm6-b-compat-harness`         | `3b7680b9`            | merged, 5/5 verde                                               |
| #281 PM6 checkpoint                | `docs/pm6-checkpoint-after-278-280` | `ba6e6016`            | merged                                                          |
| #282 Re-pin R5.8.26                | `release/r5-8-26-repin`             | `90689c95`            | merged, 7/7; migration aplicada; atestação VERIFIED; H.3-E PASS |

PRs abertos antigos (#7–#161, fora desta missão): não tocados; alguns são autorizações H.3-E
do dono. Não fazer merge nem fechar sem instrução.

## 18. Estado do CI

`main` `e2d2bdd6`: Quality Gates (43373885573), Queue Semantics Probe (43373885425), R5.8.3 (43373885821),
R5.8.4 (43373915358), F553 pós-conclusão (43377059225): todos `success`. H.3-E: 1ª execução BLOCKED
(43376276588, F553 ainda rodando); 2ª PASS 18/18 (43377084815). CONFIRMADO em 2026-11-13 (reconciliação PM6 §C).

R5.8.26: #282 7/7 `success` no head `9e799136`; atestação `parser-runtime-attestation.yml` (43523117499) `success`,
proveniência `dcaaf0a7` VERIFIED; H.3-E em `90689c95` (43523214027) PASS 18/18 na 1ª execução. CONFIRMADO em 2026-11-13 22:56Z.

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
2. Restabelecer os conectores Railway, Lovable e remote-devices (502 em 2026-11-13). Sem eles: nada de leitura da
   config Railway e do Lovable, nem acesso às 3 demos da pasta Downloads autorizadas no PM6.
3. Autorização específica continua exigida para: reprocessar/backfill de demos reais, mudanças
   destrutivas, segurança, billing e custos relevantes.

4. **PM2 (MANUAL_REQUIRED):** duas contas reais para o teste IDOR em dois sentidos e o E2E. A conta B precisa de uma
   partida processada. Os 4 secrets `PM2_E2E_*` são cadastrados pelo dono no GitHub; nenhuma senha passa pelo chat.

## 22-A. Estado do PM2 no fechamento (2026-11-17)

| Item               | Estado                                                                                                             | Evidência                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| PRs                | #291–#301 merged; #302 (docs) aberto                                                                               | merges: #299 `e04893ab`, #300 `47ba6ffe`, #301 `76fa4887` |
| Railway / release  | R5.8.29: deployment `3375b68b` SUCCESS (`4ef83d14` SKIPPED pelo freeze; `bb92ed95` REMOVED)                        | `list-deployments` 2026-11-17                             |
| Runtime identity   | `git:47ba6ffe…` nos 2 hosts, demoparser2 0.42.2, `declared_revision_matches` true                                  | `/version` 2026-11-17                                     |
| Atestação / H.3-E  | run 44013092142 success; H.3-E PASS 18/18 em `76fa4887`                                                            | Actions                                                   |
| Demo FACEIT Nuke   | job `93450453` processado, 181 kills, 0 kills sem vítima                                                           | relatório §24, §26                                        |
| Replay em produção | VALIDADO: 24/24 rounds, 7274 amostras, play/pause, deep link de `/deaths`                                          | relatório §5, §26                                         |
| Mapas              | VALIDATED: Dust2, Mirage, Inferno, Nuke, Ancient, Anubis e Cache. NOT_VALIDATED: Overpass, Train e Vertigo         | relatório §22                                             |
| Pendências formais | IDOR em dois sentidos (MANUAL_REQUIRED) e E2E de browser (PENDENTE)                                                | relatório §28                                             |
| Riscos residuais   | latência do segmento de 2,7–3,0 s (hipótese em §27); alerta de segurança do Lovable NOT_VERIFIED; etapa E DEFERRED | relatório §16, §21, §25, §27                              |
| Recomendação       | fechar IDOR e E2E; depois, com autorização, PM3 com a latência como item de observabilidade                        | relatório §20                                             |

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
- Fase atual: fechamento do PM2 (Etapa A do Prompt Mestre 3). PM3 não iniciado; exige autorização explícita
- Estado: replay e diagnóstico de mortes VALIDADOS EM PRODUÇÃO; veredito PM2 PARCIAL
- Última etapa concluída: release R5.8.29 (atestação success, H.3-E PASS 18/18) e validação do replay com a demo FACEIT Nuke
- Próxima ação: dono cria a conta B e cadastra os secrets `PM2_E2E_*`; depois, rodar o E2E e o IDOR em dois sentidos
- Branch: `main`
- Commit: `76fa4887` (merge do #301)
- PR: #302 (docs do fechamento)
- CI: #301 verde no SHA exato; Quality Gates, F553, atestação e H.3-E verdes em `76fa4887`
- Testes pendentes: IDOR em dois sentidos com duas contas reais; E2E de browser
- Bloqueios: MANUAL_REQUIRED (duas contas reais e os secrets)
- Arquivo central: `docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`
- Relatórios por PM: `docs/pm1/`, `docs/pm2/PM2_FINAL_REPORT.md`, `docs/pm6/`
- Não repetir: validação do replay com nova demo; releases R5.8.28 e R5.8.29; validação dos 7 mapas; corpus do PM2

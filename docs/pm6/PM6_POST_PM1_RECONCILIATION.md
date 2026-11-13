# PM6 — Reconciliação read-only pós-PM1

Gate obrigatório do Prompt Mestre 6 (§0.1). Execução em 2026-11-13, entre 14:48 e 15:20 UTC, pela sessão Claude
`session_012aG79D5h8yCsYxNjWpDaHG`. Nenhum código, configuração, secret, deploy ou publicação foi alterado durante
a auditoria. A única escrita é este documento e a correção do checkpoint, feita **depois** da auditoria (§D.3).

Classificação: `CONFIRMED` · `DISCREPANCY` · `NOT_VERIFIED` · `NOT_APPLICABLE`.

## Limitações de acesso desta sessão (fato)

- Os conectores **Railway**, **Lovable** e **remote-devices** falharam ao conectar (HTTP 502,
  `CLIENT_HTTP_NOT_IMPLEMENTED`) durante toda a auditoria. Sem eles não há leitura direta da configuração do
  serviço Railway, do projeto/banco Lovable ou da pasta Downloads do dono.
- O shell da sessão não alcança `parser.gamepro.network` nem `*.up.railway.app`: o proxy de saída responde
  `403` (allowlist). Os endpoints públicos foram lidos pelo Claude in Chrome do dono, sem cookies.
- Observações do Railway citadas abaixo vêm da própria sessão, quando o conector funcionava (2026-11-13, entre
  03:00 e 04:30 UTC), e dos specs de release versionados. A data de cada observação aparece ao lado dela.

## Resumo

| Item | Tema                                              | Classificação                                                     |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------- |
| A    | Railway: `source.commitSha` × deployment ativo    | `DISCREPANCY` (metadado); runtime `CONFIRMED` em `c3593d48`       |
| B    | `/version` e versão realmente instalada do parser | `CONFIRMED` (identidade declarada e de build); instalada: ver B.3 |
| C    | Checks do PR #277 e de `main`                     | `CONFIRMED`                                                       |
| D    | Consistência do checkpoint central                | `DISCREPANCY` (18 itens; corrigidos no mesmo PR)                  |
| E    | Bundle público Lovable × `e2d2bdd6`               | `NOT_VERIFIED` — `NOT_VERIFIABLE_WITH_AVAILABLE_EVIDENCE`         |

Conclusão do gate: **nenhuma inconsistência de identidade do parser, build pin, atestação ou gates obrigatórios**.
O PM6 pode seguir com o trabalho independente. Antes de qualquer release do parser, é preciso reler a configuração
do serviço Railway com o conector restabelecido (A.4).

---

## A. Railway: configuração × deployment

### A.1 Fatos

| Evidência                                                              | Valor                                                                                                                                                   | Fonte / momento                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `source.commitSha` da configuração do serviço `cs2-demo-parser` (prod) | `4716f89429fd85f828e1e786d6520895d7bece53`                                                                                                              | `get-service-config`, 2026-11-13 ~03:00Z (antes do deploy da R5.8.25)                  |
| `build.watchPatterns`                                                  | `["/services/cs2-demo-parser/.release-freeze-r5-8-17"]`                                                                                                 | mesma leitura                                                                          |
| Deployment ativo                                                       | `d57b9089-ea97-44b0-b236-6868f84459e2`, SUCCESS, commit `c3593d48`, criado 2026-11-13T03:08:37Z                                                         | `list-deployments`, 2026-11-13 ~03:15Z                                                 |
| Deployment anterior                                                    | `0ff96670-…`, REMOVED, commit `4badf606`                                                                                                                | mesma leitura                                                                          |
| Build log do `d57b9089`                                                | `BUILD_INFO.json` com commit `c3593d48…` (passo [6/7]); `Successfully installed … demoparser2-0.42.2`                                                   | `get-logs` build, 2026-11-13 ~03:20Z; registrado em `docs/reference/r5_8_25/spec.json` |
| `/version` (dois hosts)                                                | `build.commit = c3593d48…`, `embedded: true`, `source: railway`, `declared_revision_matches: true`                                                      | Chrome, 2026-11-13 14:48:57Z (§B)                                                      |
| `4716f894` no Git                                                      | merge do PR #179 (`release/r5-8-16-deploy-marker`, 2026-10-21); ancestral de `c3593d48`, 222 commits atrás                                              | `git show`, `git merge-base --is-ancestor`                                             |
| Histórico de `4716f894` no Railway                                     | deployment `1886c473…` da R5.8.16, disparado em 2026-10-22 **pelo agente do Railway com o commit exato** depois que o push do marcador não gerou evento | `docs/reference/r5_8_16/spec.json` (`observed.railway_deployment.release_control`)     |
| Releases seguintes (R5.8.17 → R5.8.25)                                 | todas com watch pattern congelado em `.release-freeze-r5-8-17` e **um** deploy do commit exato via agente                                               | `docs/reference/r5_8_{17..25}/spec.json`                                               |

### A.2 Significado de cada SHA

- **Deployment `commitHash`** (`c3593d48`): o commit que o Railway clonou e construiu para aquele deployment.
  - É o que roda: o Dockerfile grava o commit no `BUILD_INFO.json` no build, e o `/version` o lê da imagem em
    execução (`services/cs2-demo-parser/settings.py:43-59`, `app.py:506-516`).
  - Classificação: `CONFIRMED` para o deployment ativo.
- **`source.commitSha` da configuração** (`4716f894`): campo da configuração do serviço, não do deployment.
  - A documentação oficial do Railway consultada não o define.
  - Relatos da comunidade o descrevem como um **pin persistente de commit**: o serviço deixa de acompanhar o branch
    até o pin ser removido (Station, "How to remove source.commitSha pin without redeploy?").
  - O valor coincide exatamente com o único deploy feito pelo agente depois de um push perdido (R5.8.16). Nas
    releases seguintes, o agente fez deploys de commits exatos e o campo não mudou.
- **`PARSER_REVISION` / `PARSER_BUILD_REVISION`** (variáveis): revisão _declarada_. O `/version` mostra que elas
  coincidem com o commit da imagem (`declared_revision_matches: true`).

### A.3 Risco

- **Fato:** o código em execução é `c3593d48`, e não `4716f894`. Prova: o commit do `BUILD_INFO` lido da imagem no
  `/version` dos dois hosts, a atestação VERIFIED do deployment `d57b9089` (provenance `841c0bb9`) e o H.3-E PASS
  em `e2d2bdd6`.
- **Hipótese (`NOT_VERIFIED`):** se o campo for de fato um pin, um deploy disparado pela fonte (redeploy pela
  fonte ou push que case o watch pattern) poderia construir `4716f894`, que tem demoparser2 0.42.0 e código de
  21/10.
- **Mitigação existente (fato):** um runtime nesse estado falharia fechado em vez de processar.
  - O recorder e a assertion exigem `d57b9089`/`c3593d48`.
  - A ponte exige `expectedWorkerBuildCommit = c3593d48` com `enforced: true` (endpoint público, §E).
  - O lock do parser exige revisão e versão `git:c3593d48`/0.42.2.
- Risco residual: indisponibilidade da pipeline, não processamento com código antigo.

### A.4 Pendência

`NOT_VERIFIED` com o conector atual. Na próxima sessão com o Railway disponível, reler `get-service-config` e
`describe-service`, apenas para leitura:

1. registrar se o `source.commitSha` continua em `4716f894`;
2. registrar se a configuração expõe autodeploy, branch e trigger;
3. não alterar nada.

Remover ou alinhar o pin é uma mudança de configuração do serviço. Ela exige autorização específica do dono e
deve entrar num release controlado, nunca nesta auditoria.

---

## B. Versão real do parser em execução

### B.1 Resposta integral (Claude in Chrome, sem cookies, `Date: Fri, 13 Nov 2026 14:48:57 GMT`)

`GET https://parser.gamepro.network/version` → 200

```json
{
  "parser": {
    "name": "demoparser2",
    "version": "0.42.2",
    "revision": "git:c3593d48e3b8923048def625cf59144100f59892",
    "semantic_revision": "git:c3593d48e3b8923048def625cf59144100f59892",
    "build_revision": "git:c3593d48e3b8923048def625cf59144100f59892"
  },
  "contract_version": 1,
  "build": {
    "commit": "c3593d48e3b8923048def625cf59144100f59892",
    "embedded": true,
    "source": "railway",
    "declared_revision_matches": true
  }
}
```

- `GET https://cs2-demo-parser-production.up.railway.app/version`: corpo idêntico.
- `GET https://parser.gamepro.network/health`: 200, `{"status":"ok"}`.

### B.2 Campo a campo

| Campo                                           | Valor           | Origem no código                                                                                                           | Classificação                       |
| ----------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `parser.version`                                | 0.42.2          | **constante** `settings.PARSER_VERSION` (`settings.py:21`, `app.py:498`) — não lê o pacote                                 | `CONFIRMED` como versão _declarada_ |
| `revision`/`semantic_revision`/`build_revision` | `git:c3593d48…` | variáveis do Railway                                                                                                       | `CONFIRMED`                         |
| `build.commit`                                  | `c3593d48…`     | `BUILD_INFO.json` gravado no build da imagem                                                                               | `CONFIRMED`                         |
| `declared_revision_matches`                     | `true`          | revisão declarada = `git:` + commit da imagem                                                                              | `CONFIRMED`                         |
| `declared_revision`                             | —               | não existe como campo                                                                                                      | `NOT_EXPOSED`                       |
| versão instalada de `demoparser2`               | —               | não exposta no `/version`; existe em `GET /v1/runtime/preflight` (`packageVersion`, via `importlib.metadata`; exige token) | `NOT_EXPOSED` no endpoint público   |

### B.3 Versão instalada: evidência disponível

1. **Build log do deployment ativo:** `Successfully installed … demoparser2-0.42.2` (2026-11-13 ~03:09Z;
   `docs/reference/r5_8_25/spec.json` → `observed.railway_deployment.build_info`). Evidência direta, com data.
2. **Comportamento:** o job de produção `aa968c9e` (2026-11-13 05:07Z) leu 23 rounds e 142 kills da demo
   `furia-vs-vitality-m2-dust2`. Nessa demo, a 0.42.0 e a 0.42.1 lançam `EntityNotFound` em todo `parse_event`
   (reprodução local, `docs/reference/R5_8_25_DEMOPARSER2_0422.md`). É evidência indireta de que a versão instalada
   é ≥ 0.42.2.
3. **Requisito fixado:** `requirements.txt` do commit `c3593d48` tem `demoparser2==0.42.2`.

**Lacuna:** o `/version` declara a versão por constante e não a compara com `importlib.metadata`. Nenhuma checagem
de runtime falha se as duas divergirem. Recomendação ao PM6 (PR de capacidades ou de release, **não** nesta
auditoria):

- expor `packageVersion` no `/version`, ou fazer o startup falhar quando `packageVersion != PARSER_VERSION`;
- tratar isso como mudança de runtime, com re-pin e atestação.

---

## C. Workflows e checks do PR #277 e de `main`

PR #277: `merged` em 2026-11-13T05:43:32Z; head `e655399c`; merge `e2d2bdd69e9eca632f30e4a2d7e62cd0d517ebfe`.
`main` atual = `e2d2bdd6` (`git fetch`, 14:48Z).

### C.1 Head do PR (`e655399c`) — run 43370492979 (Quality Gates, `pull_request`)

| Check                           | Conclusão |
| ------------------------------- | --------- |
| CS2 parser tests                | success   |
| Contract-sensitive parser tests | success   |
| Web tests / lint / build        | success   |
| F553 R11.2 EXECUTION            | success   |
| Main required gates             | success   |

### C.2 Merge commit em `main` (`e2d2bdd6`) — checks vinculados a **este SHA exato**

| Workflow (run)                                       | Evento       | Job                                                                        | Conclusão                                                                                                                            |
| ---------------------------------------------------- | ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Quality Gates (43373885573)                          | push         | CS2 parser tests; Contract-sensitive; Web; F553 R11.2; Main required gates | success (todos)                                                                                                                      |
| Queue Semantics Probe (43373885425)                  | push         | Queue semantics (disposable DB); Queue recovery E2E (worker real)          | success (ambos)                                                                                                                      |
| R5.8.3 Read-Only Release Preflight (43373885821)     | push         | preflight                                                                  | success                                                                                                                              |
| R5.8.4 Read-Only Gate Reconciliation (43373915358)   | workflow_run | reconcile                                                                  | success                                                                                                                              |
| F553 R11.2 post-completion attestation (43377059225) | workflow_run | attestation                                                                | success                                                                                                                              |
| H.3-E Activation Gate (43376276588)                  | workflow_run | gate                                                                       | **failure**, `decision=BLOCKED` (`quality_gates=BLOCKED`, `f553_post_completion=BLOCKED`: o F553 ainda rodava; demais estágios PASS) |
| H.3-E Activation Gate (43377084815)                  | workflow_run | gate                                                                       | **success**, `decision=PASS`, todos os 18 estágios PASS                                                                              |

- A API de _commit statuses_ devolve `state=pending` com `total_count=0` para os dois SHAs. Isso significa que
  não há statuses legados, e não que haja algo pendente: os checks são check-runs.
- `NOT_APPLICABLE`: o workflow A9.1 (Python/WASM harness) é manual e não rodou nesses SHAs.

Conclusão: CI **verde no SHA exato `e2d2bdd6`**, com a primeira execução do H.3-E BLOCKED por ordem de conclusão.
É o padrão conhecido (checkpoint §21.5).

---

## D. Auditoria do checkpoint central

### D.1 Escopo

`docs/CS2_PRO_CONTINUITY_CHECKPOINT.md` em `e2d2bdd6`, inteiro, comparado com:

- `main` e os PRs integrados;
- `docs/pm1/PM1_EXECUTION_REPORT.md`;
- `docs/specifications/README.md`;
- `docs/checkpoints/*`;
- este documento.

Arquivos complementares de status procurados (PM6 §2.3):

- **não existe** arquivo de roadmap/status consolidado de PRs;
- `docs/H3E_RELEASE_STATUS.md` é um relatório datado de 2026-10-13, e não um status vivo;
- `docs/specifications/README.md` mantém a tabela PM → entregas/módulos e é a referência complementar oficial
  para a divisão dos Prompts Mestres.

### D.2 Divergências (linha = linha em `e2d2bdd6`)

| #   | Seção / linha    | Conteúdo atual (resumo)                                                                                                                                                           | Evidência atual                                                                                           | Correção                                                                                                                                                   | Prioridade |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Retomada, L17    | "Próximo: PM2 … aguardando o dono"                                                                                                                                                | O dono enviou o PM6 (2026-11-13) para rodar antes do PM2                                                  | Fase atual = PM6                                                                                                                                           | Alta       |
| 2   | Retomada, L18    | "Etapa atual: PM1 C6"                                                                                                                                                             | PM1 encerrado em #277                                                                                     | Etapa = gate de reconciliação do PM6                                                                                                                       | Alta       |
| 3   | Retomada, L24    | Branch ativa `docs/pm1-r5825-evidence`                                                                                                                                            | Branch mergeada (#277)                                                                                    | `main` + branch do PR A do PM6                                                                                                                             | Média      |
| 4   | Retomada, L25    | Último commit em `main` = `67655b5a`                                                                                                                                              | `main` = `e2d2bdd6`                                                                                       | Atualizar SHA e lista                                                                                                                                      | **Alta**   |
| 5   | Retomada, L26    | Build validado em produção `67655b5a`                                                                                                                                             | `e2d2bdd6` publicado (`879daee6`), mas sem prova de bundle (§E)                                           | Distinguir validado (`67655b5a`) de publicado, não verificável (`e2d2bdd6`)                                                                                | Alta       |
| 6   | Retomada, L28    | Próxima ação "aguardar o PM2"                                                                                                                                                     | Ordem do PM6 §0                                                                                           | Próxima ação = PR A do PM6                                                                                                                                 | Alta       |
| 7   | §2, L39–41       | "`main` = `b2c8219c` … implementação não iniciada"                                                                                                                                | PM1 concluído; `main` = `e2d2bdd6`                                                                        | Reescrever o estado atual                                                                                                                                  | **Alta**   |
| 8   | §3, L45–49       | Missão "próxima: registrar e mapear a especificação 4.2"                                                                                                                          | Especificação registrada (#263, #270); PM1 executado                                                      | Missão vigente = PM6                                                                                                                                       | Alta       |
| 9   | §4–5, L56–59     | "Cinco Prompts Mestres: NÃO definidos … hipótese"                                                                                                                                 | Dono confirmou a divisão em 2026-11-12 (`docs/specifications/README.md` L17–23); existe também o PM6      | Registrar a divisão confirmada e o PM6                                                                                                                     | Alta       |
| 10  | §4–5, L64–68     | Fases 1–5 "PENDENTE DE CONFIRMAÇÃO"                                                                                                                                               | Mesma evidência; `PHASE_1_CHECKPOINT.md` ainda "não iniciada"                                             | Mapear fases → PMs e marcar PM1 concluído; os arquivos `PHASE_*` ficam como estão (histórico) e o central aponta para os relatórios `docs/pm1`, `docs/pm6` | Média      |
| 11  | §14, L112–114    | Só os testes da fundação                                                                                                                                                          | PM1 e R5.8.25 com suítes locais e CI (relatório PM1 §10)                                                  | Acrescentar resumo e link                                                                                                                                  | Baixa      |
| 12  | §16–17, L123–140 | Tabela termina em #276                                                                                                                                                            | #277 mergeado (`e2d2bdd6`)                                                                                | Acrescentar #277 (e o PR A do PM6)                                                                                                                         | Média      |
| 13  | §18, L147–148    | "`main` `e60a70f6` … todos success"                                                                                                                                               | §C deste documento                                                                                        | `main` `e2d2bdd6`, com runs                                                                                                                                | **Alta**   |
| 14  | §19, L152–154    | "Publicado via `deploy_project` … validado em `f1276859`"                                                                                                                         | Publicações do PM1; o PM6 §14 passa a publicação para o dono                                              | Atualizar e registrar a regra nova                                                                                                                         | Alta       |
| 15  | §21, L174–175    | Item 9: "app persiste só contagens; produção sem posições"                                                                                                                        | Contradiz o item 3: posições no tick da morte persistidas desde a R5.8.24/25 e validadas (job `aa968c9e`) | Reescrever o item 9 (só posições no tick da morte; nenhuma contínua)                                                                                       | **Alta**   |
| 16  | §22, L187–188    | Ações: "enviar os cinco PMs; confirmar o módulo J"                                                                                                                                | Ambos resolvidos em 2026-11-12                                                                            | Marcar como resolvidos; nova pendência: conectores Railway/Lovable/remote-devices                                                                          | Média      |
| 17  | Resumo, L213–223 | "Estado: especificação mapeada"; "Última etapa: Marco 1 (`e60a70f6`)"; "Commit `67655b5a`"; "CI verde em `e60a70f6`"; "Bloqueios: cinco PMs não definidos"; "Fases 1–5 pendentes" | Itens 4, 7, 9, 13                                                                                         | Reescrever o resumo                                                                                                                                        | **Alta**   |
| 18  | Ausente          | Nada sobre o `source.commitSha` do Railway nem sobre a versão declarada × instalada                                                                                               | §A, §B                                                                                                    | Acrescentar aos riscos (§21)                                                                                                                               | Média      |

Itens **corretos** (sem mudança):

- L19–20, última etapa e operação do PM1;
- §11, decisões;
- §12–13;
- §20, gates preservados;
- §21 itens 1–8 e 10–15, exceto o item 9 (o item 5 continua observado em `e2d2bdd6`, §C);
- §23–24.

### D.3 Correção

Aplicada no mesmo PR (`docs/CS2_PRO_CONTINUITY_CHECKPOINT.md`), preservando o histórico: as seções antigas são
reescritas como estado atual, e os detalhes históricos continuam nos relatórios versionados (fundação, PM1, specs
de release).

---

## E. Bundle público Lovable

| Pergunta                                       | Evidência                                                                                                                                                                                                                                                                                                     | Classificação                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `latest_commit_sha` do projeto                 | `67655b5a` em 2026-11-13 04:07Z (`get_project`). Não foi relido depois do merge do #277: conector Lovable indisponível                                                                                                                                                                                        | `NOT_VERIFIED` para `e2d2bdd6`              |
| Publicação de `e2d2bdd6`                       | `deploy_project` devolveu `pending`, deployment `879daee6`, em 2026-11-13 ~05:45Z (sessão do PM1). Pelas regras do próprio Lovable, `pending` não confirma publicação                                                                                                                                         | `NOT_VERIFIED`                              |
| SHA/build no bundle servido                    | O app não embute SHA, versão de build nem sourcemap público verificável; o HTML e os assets não expõem commit (busca no código: nenhuma variável de commit no build do app)                                                                                                                                   | `NOT_VERIFIABLE_WITH_AVAILABLE_EVIDENCE`    |
| Comportamento observável do servidor publicado | `GET https://gamepro.network/api/public/parser-attestation-runtime` (Chrome, 2026-11-13 ~15:00Z): `parserLock` 0.42.2 / `git:c3593d48…` vindos das secrets (`revisionSource: env`), `bridge.expectedWorkerBuildCommit = c3593d48…`, `enforced: true`. É consistente com qualquer build a partir de `67655b5a` | `CONFIRMED` (comportamento), sem provar SHA |
| Diferença funcional `67655b5a` → `e2d2bdd6`    | `git diff --stat`: docs e `src/lib/metrics/metricContract.ts` (`RELEASE_MATRIX`); `RELEASE_MATRIX` não é consumido por rota nem por tela (`grep`)                                                                                                                                                             | Diferença não observável em produção        |

**Conclusão:** não é possível provar que o bundle servido corresponde a `e2d2bdd6`. Também não há como observar
diferença funcional entre `67655b5a` e `e2d2bdd6`.

**Regra a partir do PM6 (§14):** a publicação do app via Lovable é ação manual do dono. Nesta sessão não houve
nenhuma interação com o Lovable: os conectores estavam indisponíveis e nenhuma ação foi tentada.

**Recomendação (futura, `ADAPT`):** expor o SHA do build do app em um endpoint público sem segredos, por exemplo um
campo `appBuildCommit` em `parser-attestation-runtime` vindo de variável de build. Isso permitiria provar o
alinhamento do bundle. Não implementado nesta auditoria.

---

## Pendências do gate

1. Reler a configuração Railway (`source.commitSha`, triggers) quando o conector voltar (§A.4). Leitura apenas.
2. Reler `latest_commit_sha` e o estado de publicação no Lovable quando o conector voltar (§E). Leitura apenas.
3. Divergência declarada × instalada sem checagem de runtime (§B.3): entra no plano do PM6 como mudança
   controlada.
4. Demos locais do dono (PM6 §1): pasta Downloads inacessível nesta sessão (conector `remote-devices` com 502).
   Nenhuma das três demos foi lida.

## Fontes externas

- Railway Station (comunidade), "How to remove source.commitSha pin without redeploy?":
  https://station.railway.com/community/how-to-remove-source-commitsha-pin-witho-855ac31e
- Railway Station, "Clarification of exact-commit deployment and rollback side effects":
  https://station.railway.com/questions/clarification-of-exact-commit-deployment-3943e02a
- Railway docs, "Manage services" (API): https://docs.railway.com/integrations/api/manage-services

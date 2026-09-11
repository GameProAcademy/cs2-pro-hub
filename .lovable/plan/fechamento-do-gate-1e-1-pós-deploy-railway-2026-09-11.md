# Fechamento do Gate 1E.1 — pós-deploy Railway

## Estado verificado agora (sem alterar nada)

**Runtime/deploy do APP**
- O APP roda em TanStack Start sobre runtime serverless edge (Cloudflare Workers). Todo código de parse é chamado via `createServerFn` server-side; segredos são lidos com `process.env[...]` dentro dos handlers. O parse real nunca roda no APP — vai por HTTPS ao worker Railway.

**Worker Railway — AGORA VIVO (antes retornava 404)**
- `GET /health` → HTTP 200 `{"status":"ok"}`
- `GET /version` → HTTP 200: `name=demoparser2`, `version=0.42.0`, `contract_version=1`, `revision=git:62c37147a64c4037f9825253cdb041baafab6fe3`
- A identidade bate com os defaults do APP (`demoparser2` / `0.42.0` / contrato `1`).

**Variáveis server-side (nomes apenas; valores nunca lidos/expostos)**

| Variável | Estado |
| --- | --- |
| `DEMO_PARSER_URL` | configurada (valor oculto; não dá para confirmar visualmente se termina em `/v1/parse`) |
| `DEMO_PARSER_TOKEN` | configurada (valor oculto) |
| `DEMO_PARSER_EXPECTED_NAME` | configurada |
| `DEMO_PARSER_EXPECTED_VERSION` | configurada |
| `DEMO_PARSER_EXPECTED_REVISION` | **ausente** |
| `DEMO_PARSER_REVISION_REQUIRED` | **ausente** (default: obrigatória em produção) |

**Observações**
- O projeto ainda **não foi publicado** (não há Published URL); o ambiente ativo é o preview. As secrets valem para ambos.
- O código (`parserEndpoint.ts`) falha fechado com `PARSER_CONFIG_ERROR` se `DEMO_PARSER_URL` não terminar em `/v1/parse` — uma URL errada não passa silenciosamente.
- Como `DEMO_PARSER_EXPECTED_REVISION` está ausente e o lock de revisão é obrigatório por padrão em produção, o parse em produção falharia fechado (`revision lock`) até configurar a revisão.

## Plano (após aprovação)

1. **Confirmar o endpoint `/v1/parse` sem ler o segredo**: chamar a função de diagnóstico admin (`getAdminParserWorkerStatus`) pela sessão do admin e verificar o veredito do probe (endpoint resolvido, identidade, erros). Isso confirma indiretamente se `DEMO_PARSER_URL` aponta para o `/v1/parse` correto.
2. **Pedir ao usuário para adicionar** `DEMO_PARSER_EXPECTED_REVISION=git:62c37147a64c4037f9825253cdb041baafab6fe3` em Project Settings → Secrets (a revisão imutável real agora existe no Railway). Nenhuma alteração de código é necessária — a expectativa já é configurável por env.
3. **Re-rodar o probe admin** e confirmar ausência de `PARSER_IDENTITY_MISMATCH`/revision error.
4. **Prova E2E real**: upload de um `.dem` real pelo `DemoIngestPanel` e verificação de job concluído com persistência canônica (ou classificação honesta de erro se a demo for inválida).
5. **Atualizar documentação** (`docs/PHASE-2.7...` e `roadmap.md`): Gate 1E.1 de BLOCKED → fechado, com data e evidência.
6. Validação final: testes, typecheck, lint, build.

## Fora de escopo
Nenhuma mudança em Canonical Engine, integrações, métricas, UI, RLS ou Storage. Nenhum valor de segredo será exibido.

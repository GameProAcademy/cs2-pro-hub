# Contrato de métricas da Fase 4.2 — `metric-contract-v1` (entrega 4.2.1)

Código: `src/lib/metrics/metricContract.ts` (puro). Testes: `src/lib/__tests__/metricContract.test.ts`.
Origem: especificação mestre, §4 (taxonomia e campos) e §24 (passos da 4.2.1).

## O que esta versão entrega

1. **Taxonomia oficial** (`METRIC_STATUSES`), idêntica e na mesma ordem da tabela do §4 do original
   — há teste que lê o original e compara: `OBSERVED`, `DERIVED`, `INFERRED`, `NOT_OBSERVED`,
   `NOT_MEASURED`, `INSUFFICIENT_SAMPLE`, `UNAVAILABLE`.
2. **Envelope** (`MetricEnvelope`) com os campos recomendados no §4: `metric_key`, `value`, `unit`,
   `status`, `provenance_method`, `sample_size`, `coverage`, `confidence`, `evidence_refs`,
   `schema_version`. O construtor `envelope()` **recusa**:
   - valor diferente de `null` em estado sem medida (null ≠ zero);
   - estado medido sem valor finito;
   - percentual sem denominador positivo (§4.1);
   - cobertura maior que o elegível; estado fora da taxonomia.
     `confidence` é sempre `null`: nada no produto é calibrado (o §4 só permite confiança calibrada).
3. **Adaptador** `fromObservation()` do contrato `xray-v1` (sem renomear campos nem mudar valores):
   `MEASURED` de contagem → `OBSERVED`; de razão/média → `DERIVED`; `NOT_MEASURED` →
   `NOT_MEASURED`; `EXCLUDED_BY_ADMISSION` → `UNAVAILABLE`.
4. **Matriz de liberação** (`RELEASE_MATRIX`, §24 passo 7): toda métrica exibida hoje (as 17 do
   catálogo canônico `metrics-catalog-v1`, DNA, Score, contexto de round) e todas as linhas da tabela
   do §4 do original, com `SUPPORTED | PARTIAL | NOT_MEASURED | INSUFFICIENT_SAMPLE | UNAVAILABLE |
BLOCKED_PROVENANCE`, bloqueios nomeados (L02, L03, L04, posições não persistidas, atirador não
   atribuído, sem classificador de compra, atribuição heurística, sem dataset licenciado, volume de
   amostra, não implementado) e evidência. O que L02/L03/L04 proíbem nunca é `SUPPORTED` (teste).

## O que já existia e foi reutilizado

`src/lib/metrics/canonicalMetrics.ts` (`metrics-catalog-v1`): fonte, unidade, fórmula, denominador,
agregação, classes de dados da admissão, amostra mínima, regra de nulo e casas decimais das 17
métricas exibidas, com teste que falha se uma métrica da UI faltar. Não foi alterado.

## O que ainda falta para fechar a 4.2.1

- Adotar o envelope nos read models e nas respostas de API novas (as atuais seguem `xray-v1` e
  `coach-context-v1`, compatíveis).
- `coverage` e `evidence_refs` preenchidos pelos produtores (hoje `null`/vazio no adaptador).
- Testes de "null não vira zero" na exportação e no prompt do Coach para o envelope (o Coach já é
  coberto pelos testes do `coach-context-v1`).
- Sem mudança de UI nesta versão.

## Rollback

Reverter o PR: módulo novo, sem consumidores obrigatórios, sem migration.

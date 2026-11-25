# Experimentos B e C (R-15 e R-16): estado em 2026-11-25

## B: radar alternativo com jogadores reais

- Não foi executado e não será simulado.
- Depende de 3 a 5 jogadores reais e não bloqueia a próxima fase.
- A alternativa A continua sendo o Player DNA oficial.
- Nada de B foi implementado.

## C: comparação histórica de snapshots

Validação técnica feita na #374 (`src/lib/dna/snapshotCompare.ts`). A comparação não está ligada a nenhuma tela e não substitui o radar.

Dados usados: os três snapshots `dna-weighted-v3` reais da conta de teste.

| Criado (UTC)     | Partidas / rounds | md5 da linha (igual antes e depois) |
| ---------------- | ----------------- | ----------------------------------- |
| 2026-11-24 18:51 | 3 / 64            | `e78ab904bd37fe4fa40d8682b77918a8`  |
| 2026-11-25 02:15 | 4 / 88            | `a3e5ff118b25a2c71acb63be6652d187`  |
| 2026-11-25 05:58 | 5 / 118           | `7b25aa0120f62cbe4532e624610479ae`  |

| Pergunta                           | Resultado                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Mesma versão metodológica          | sim; outra versão ou outra `feature_versions` → `VERSION_MISMATCH` / `FEATURE_VERSION_MISMATCH`                                         |
| Períodos e amostras identificáveis | sim; partidas compartilhadas, adicionadas e removidas, e rounds de cada lado                                                            |
| Relação entre janelas              | `CUMULATIVE`: cada snapshot contém o anterior mais 1 partida                                                                            |
| Cobertura comparável               | 8 dimensões com valor nos três; Clutch e Economia nulos nos três, `NO_VALUE_IN_EITHER`, nunca zero                                      |
| Melhoria real × ruído              | não distinguível: o snapshot não guarda variância por dimensão, então todo delta é `DIRECTIONAL_ONLY` e `significance: NOT_ESTABLISHED` |
| Integridade                        | somente leitura; md5 das linhas inalterado; teste garante que as entradas não são mutadas                                               |

**Conclusão:**

- **O que dois snapshots provam:** que a comparação funciona tecnicamente.
- **O que não provam:** validade estatística.
- **O que falta para uma métrica de evolução:** variância por dimensão e janelas independentes.

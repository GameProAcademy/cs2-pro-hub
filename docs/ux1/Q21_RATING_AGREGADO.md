# Q-21 (R-37) — Rating agregado

Decisão do dono em 2026-11-25:

- Preferência 1: recalcular sobre os dados agregados, se for matematicamente correto.
- Preferência 2: média ponderada por rounds, documentada como tal.

Implementado em #373 (`metrics-catalog-v2.1`), publicado e validado em produção.

## Fórmula (inalterada, por partida)

```
rating = max(0, 0,45·(KPR/0,70) + 0,25·(1 − DPR/0,75) + 0,30·(ADR/80))
KPR = kills/rounds   DPR = deaths/rounds   ADR = dano bruto/rounds
```

`src/lib/pipeline/metrics.ts`: `compositeRating` = `max(0, compositeRatingUnfloored(...))`.
Nada muda em `pro-score-v1`: Rating não se mistura com Score, ADR de outra fonte ou índice de dano.

## Por que a Preferência 1 vale

Fora o piso, a expressão é linear em KPR, DPR e ADR, e as três são taxas por round. Logo, a média ponderada por rounds das notas sem piso é idêntica à fórmula aplicada às somas:

Σᵢ rᵢ·f(Kᵢ/rᵢ, Dᵢ/rᵢ, dmgᵢ/rᵢ) / Σᵢ rᵢ = f(ΣK/Σr, ΣD/Σr, Σdmg/Σr)

O piso é a única não linearidade. Por isso o agregado usa a nota sem piso de cada partida e aplica `max(0, ·)` uma vez, no fim. Quando a nota sem piso não está disponível, usa a nota guardada, que só difere da sem piso quando a partida bateu no piso. Ausência continua ausência e nunca vira zero.

Implementação em `src/lib/metrics/canonicalAggregate.ts`:

- parts de rating: `m.rating <= 0 && finite(m.ratingUnfloored) ? m.ratingUnfloored : m.rating`, pesados por rounds;
- `pooledValue('rating')`: aplica `Math.max(0, raw)`.

As notas por partida e a versão continuam guardadas.

## Exemplo reproduzível (conta de teste, 4 partidas, produção)

| Partida | Rating guardado | Rounds |
| ------- | --------------- | ------ |
| 1       | 0,91            | 24     |
| 2       | 0,70            | 17     |
| 3       | 0,89            | 23     |
| 4       | 0,72            | 24     |

- **Ponderado por rounds:** 71,49 / 88 = 0,8124, exibido como 0,81.
- **Fórmula sobre as somas:** ΣK 56, ΣD 61, Σdmg 9004,3, ΣR 88 dão 0,811736, também 0,81. A diferença na quarta casa vem do arredondamento a 2 casas das notas guardadas.

**Produção (2026-11-25, bundle `index-CJD8SEjt`):** a quinta partida (Anubis) tem rating 1,19 em 30 rounds. O agregado fica (71,49 + 35,70) / 118 = 0,9084. O Raio-X exibe "0,91 (107,2/118) em 5 partida(s)", o mesmo valor.

**Piso** (`ratingPooledQ21.test.ts`):

- com uma partida abaixo de zero, o agregado novo é 0,6297;
- a média das notas com piso dava 0,6512, superestimando o agregado.

## Testes

- `src/lib/metrics/__tests__/ratingPooledQ21.test.ts`
- `canonicalAggregate.test.ts` (versão `metrics-catalog-v2.1`)

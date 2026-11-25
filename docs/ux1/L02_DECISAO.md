# L02 — Decisão técnica sobre posições e trajetórias (R-18, Q-03)

Data: 2026-11-24 · Autor: sessão Claude, com autorização do proprietário (Prompt Mestre, Parte 3.4).
Base: Documento 2 §12.1; `admissionV3.ts` L100–113; `services/cs2-demo-parser/trajectory.py` L1–21;
`src/lib/replay/segment.ts`; `src/components/real/RealReplay.tsx`.

## 1. Política adotada

L02 vale para todos os tipos de demo. O Replay atual continua como experiência funcional, e a
apresentação espacial fica limitada às amostras observadas e permitidas pelo contrato:

- uma trajetória é um conjunto de amostras (`cs2.round-trajectory.v1`, uma leitura a cada 16 ticks),
  não uma observação contínua;
- só se desenha o que foi lido; uma interpolação só aparece entre duas leituras consecutivas de um
  jogador vivo, marcada como interpolada (tracejado, opacidade 0,45, legenda) e nunca atravessa
  lacuna (`segment.ts`: `interpolable[i]` falso quando falta a amostra i ou i+1, ou o jogador
  morreu);
- nenhuma métrica, regra de diagnóstico, prioridade de treino, fato do Coach ou texto tira
  conclusão de trajetória: presença, rotas, distância, tempo exposto, isolamento e re-peek
  continuam proibidos.

## 2. Limites de uso

| Uso | Permitido? |
| --- | --- |
| Posição no tick do evento (abate, morte) em diagnóstico e mapa de calor | Sim (não é afetada por L02) |
| Mapa de calor de abates e mortes (frequência, ≥ 10 eventos, mapa validado) | Sim |
| Desenho das amostras no Replay | Sim, em partida processada depois de R5.8.28 e mapa validado |
| Ponto interpolado no desenho | Só entre duas leituras, marcado, nunca numa métrica |
| Presença, rotas, tempo exposto, distância, mapa de presença | Não |
| Regras de morte "Exposição", "Isolamento", "Re-peek", "Tempo de rotação" | Não avaliadas (NOT_SUPPORTED) |

## 3. Critérios de cobertura

- Partida processada antes de R5.8.28: sem trajetórias (NOT_RECORDED); nada é reprocessado.
- Mapa não validado (Overpass, Train, Vertigo): nenhum desenho (MAP_NOT_VALIDATED).
- Round pulado ou com extração parcial: só os rounds com trajetória mostram o Replay.
- Coberturas por partida são mostradas pelos próprios estados do Replay; nenhuma cobertura é
  convertida em porcentagem de confiança do jogador.

## 4. Tratamento de lacunas

Uma lacuna é mostrada como lacuna: o ponto do jogador some até a próxima leitura. Não há posição
inferida, interpolação sobre lacuna nem extrapolação depois da última leitura.

## 5. Estados visuais

Observado (círculo sólido), interpolado (tracejado e translúcido, com legenda), sem amostra
(ausente), round sem trajetória, partida sem trajetórias e mapa não validado (mensagens próprias
nos 5 idiomas).

## 6. Textos corrigidos nesta decisão

As quatro regras de morte não avaliadas diziam que a posição ou a trajetória "não é guardada", o que
é falso para partidas com trajetória amostrada. O motivo agora vale para qualquer partida: a regra
exigiria observação contínua (ou o instante exato da morte) e as amostras do Replay não são usadas
como medida. Nenhuma regra passou a ser avaliada.

## 7. Riscos

- Um jogador pode ler o desenho amostrado como trajetória completa: mitigado pela marcação das
  interpolações e pela ausência de ponto nas lacunas.
- Uma mudança futura poderia usar `round_trajectories` numa métrica: o teste
  `l02Policy.test.ts` falha se um módulo de métricas, diagnóstico, treino ou Coach importar o
  módulo de trajetórias.

## 8. Alternativa futura

Ler o estado do jogador no tick exato dos eventos já cobre o diagnóstico permitido. Medidas de
movimento exigiriam outro contrato: extração contínua validada, cobertura medida por partida e
nova versão de método. Isso fica fora do UX-1.

## 9. Testes

- `src/lib/__tests__/l02Policy.test.ts`: nenhum consumidor analítico importa trajetórias; os
  quatro textos de regra existem nos 5 idiomas e não afirmam que posições "não são guardadas".
- Testes existentes do Replay (`segment.ts`): interpolação só entre leituras vivas consecutivas.

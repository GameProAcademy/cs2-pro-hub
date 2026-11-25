# Decisão O8 — evidência do vencedor por round (R-07)

Registro de decisão do dono do projeto. Este arquivo não contém código nem evidência: a implementação está no PR A (#379) e a evidência ficará no PR B. Quem aprova é o dono; quem implementa é o agente. Esta aprovação não valida antecipadamente os resultados do harness ou do gate.

- **Data:** 2026-11-25 (06:01 BRT).
- **Aprovado por:** dono do projeto, na conversa de trabalho, após revisar o relatório da Etapa 2 e o diff `r07-inventory-matrix.diff`.
- **Relatório revisado:** "CS2 PRO — R-07: relatório de governança (Etapa 2)".

## Decisões aprovadas

1. **Alternativa 1:** abertura controlada de `CanonicalRound.metadata` no contrato `canonical-demo-v3`.
2. **Inventário v2:** continua imutável. Sem nova versão, sem atualizar âncoras e sem modificar seus 105 mapeamentos.
3. **Restauração:** `capability_catalog.py`, `reconciled-field-matrix.json` e `canonical-mapping-inventory.json` voltam ao estado de `main`.
4. **Persistência:** a evidência de origem do vencedor é gravada por round no Canonical v3, sem ser descartada por `applyServerPolicyV3`.
5. **`winningSide`:** aceita ausência de valor quando não há vencedor confirmado, sem inferência nem preenchimento artificial.
6. **Estados preservados:** confirmado, ausente, inconclusivo e conflitante, conforme o contrato formal.

## Condições impostas

- Os campos só passam a `available` com evidência de duas demos reais completas:
  - determinismo;
  - round trip de persistência;
  - checagens do schema fechado;
  - gate v3 recalculado.
- O contrato e o digest são gerados pelo procedimento oficial, nunca editados à mão.
- Campos que não pertencem ao R-07 ficam inalterados.
- Merge e publicação só depois de comprovados:
  - os três testes de autoridade;
  - o inventário v2 intacto;
  - o digest correto;
  - o harness com duas demos;
  - a persistência por round;
  - nenhum `canonical_v3_withheld` para a evidência;
  - o placar igual ao da demo;
  - nenhuma alteração em métricas históricas;
  - o "Main required gates";
  - o rollback executável.
- **Restrições:**
  - nenhum ambiente adicional no Railway;
  - os três valores de identidade do worker não mudam nesta fase;
  - uma release futura segue o R5.8.31;
  - nenhum reprocessamento de partidas de produção sem autorização específica.

# Decisão O8-A — correções de compatibilidade do Canonical v3 (R-07)

Registro de decisão do dono do projeto, separado do código e da evidência. Aprova as duas correções abaixo, não os resultados.

- **Data:** 2026-11-25 (15:33 BRT).
- **Aprovado por:** dono do projeto, na conversa de trabalho, depois do relatório que mostrou o gate v3 bloqueado fora do O8 (`docs/CANONICAL_DEMO_V3.md` §8.1, PR #381).
- **Decisão de origem:** O8 (`docs/decisions/O8_ROUND_WINNER_EVIDENCE.md`).

## 1. `CanonicalEvent.type`: `incendiary`

Aprovada a inclusão de `incendiary` na allowlist do contrato v3, com estas condições:

- é um tipo legítimo, efetivamente produzido pelo parser;
- a mudança se limita a esse tipo, e os demais tipos não mudam;
- a representação persistida é compatível com o contrato;
- tipos desconhecidos ou inválidos continuam rejeitados nos testes;
- não há ampliação genérica da allowlist.

A origem técnica, a semântica e os pontos do pipeline devem ficar documentados.

## 2. `CanonicalEvent.data`: precisão decimal

Aprovada a correção do harness para comparar corretamente os valores numéricos, com estas condições:

- **Valores intactos:** nada é arredondado nem truncado; os dados de produção e a precisão armazenada no banco não mudam.
- **Comparação:** sem tolerâncias arbitrárias; a serialização é determinística e adequada à precisão dos dados.
- **Prova:** demonstrar que a diferença anterior era só de representação e que, com a representação correta, as linhas são equivalentes.
- **Testes:** decimais, inteiros, negativos, nulos e limites relevantes.

## Restrições mantidas

- **Contratos e testes:** o Mapping Inventory v2, seus digests e âncoras não mudam; nenhum contrato ou teste é enfraquecido para obter PASS.
- **Ordem:** o app é publicado antes da release do worker, com evidências próprias para cada etapa.
- **Dados de produção:** nenhuma demo de produção é reprocessada; a validação final usa uma demo nova da conta de teste, identificada manualmente.

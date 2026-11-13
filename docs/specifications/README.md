# Especificações de fase

## Fase 4.2 — especificação mestre **v1.1** e Prompt Mestre 1: **REGISTRADOS (2026-11-12)**

- **v1.1 (vigente)**, preservada byte a byte:
  `docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre_v1.1.md`.
  - 1.913 linhas, SHA-256 `a081c7e0d70e0674eb920beac96570118342fc5d793d937f7a32e2624645535b`.
  - Versão 1.1 de 12/11/2026.
- Diferenças em relação à v1.0:
  - estado `PARTIAL` na taxonomia (§4);
  - semântica espacial estrita: posições pontuais de morte ≠ presença, rota ou exposição (§1.1.1, §10.1, §11.4, §25);
  - side por jogador/round;
  - responsabilidades dos Módulos I e J (§8, §9).
- A v1.0 continua preservada como registro histórico (abaixo).
- **Prompts Mestres confirmados pelo dono (2026-11-12):**

  | Prompt Mestre | Entregas     | Módulos                                             |
  | ------------- | ------------ | --------------------------------------------------- |
  | PM1           | 4.2.1–4.2.2  | A, B (fundação)                                     |
  | PM2           | 4.2.3–4.2.4  | B, I (navegação/replay)                             |
  | PM3           | 4.2.5–4.2.6  | C, D                                                |
  | PM4           | 4.2.7–4.2.8  | E, F, G (+ J: DNA/snapshots/evolução)               |
  | PM5           | 4.2.9–4.2.10 | H, I (biblioteca), J (comparativos Pro licenciados) |

- Texto do PM1, preservado byte a byte: `docs/specifications/CS2_PRO_PROMPT_MESTRE_1.txt`.
- Execução do PM1: `docs/pm1/PM1_EXECUTION_REPORT.md`.

## Fase 4.2 — especificação mestre v1.0: **REGISTRADA e MAPEADA (2026-11-12)**

- Original preservado byte a byte: `docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre.md`
  (1.886 linhas, 85.023 bytes, SHA-256 `989ec11f04d8b31b0566e4ba6c084179b5400f00b266ced8ccdab9d01862e01a`,
  versão 1.0 de 05/11/2026, status "Proposta para revisão"). Protegido do formatador em `.prettierignore`.
- Mapeamento: `docs/specifications/FASE_4_2_MAPEAMENTO.md` (entregas, módulos, diferenciais,
  comparação com `main`, dependências, conflitos, matriz de prontidão).
- **Achado:** o original **não define os cinco Prompts Mestres**. Ver o mapeamento §1. Resolvido em 2026-11-12: o dono confirmou a divisão (tabela acima).

Histórico desta seção (antes do recebimento) abaixo, preservado.

### (histórico) Fase 4.2 — especificação mestre: **recebida em 2026-11-11, ainda não registrada nem mapeada**

Arquivo esperado: `CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre` (fornecido pelo dono
do projeto). O dono a enviou em 2026-11-11, depois desta seção ser escrita; o registro e o
mapeamento são a próxima etapa. Antes do envio, ela **não existia** no repositório: busca por nome em todas as 292 branches
remotas e no histórico de commits de `main`, sem resultado.

Caminho previsto quando recebido:
`docs/specifications/CS2_PRO_Fase_4_2_Especificacao_Tecnica_Funcional_Mestre.md`, com o conteúdo
original preservado (sem edição para acomodar decisões posteriores; complementos vão em documento
separado de decisões).

### O que se sabe (sem verificação contra o original)

| Item                          | Estado                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dez entregas `4.2.1`–`4.2.10` | Informado pelo dono; nomes e escopos **não confirmados**                                                                                                   |
| Módulos `A`–`J`               | Informado pelo dono. Os temas usados no relatório de fundação (§E) vieram do prompt da missão de fundação; **não foram conferidos** contra a especificação |
| Cinco Prompts Mestres         | Existem; **não são** cinco módulos nem, necessariamente, cinco fases técnicas                                                                              |
| Prompt Mestre 4               | Referência histórica: entregas 4.2.7–4.2.8, módulos E–G (**não verificado**)                                                                               |
| Prompt Mestre 5               | Referência histórica: entregas 4.2.9–4.2.10, módulos H–J (**não verificado**)                                                                              |
| Prompts Mestres 1–3           | **Desconhecidos**                                                                                                                                          |

Observação: as referências históricas já mostram que entrega ≠ módulo (PM4: 2 entregas, 3
módulos). Nenhuma correspondência 1:1 deve ser presumida.

### O que fazer quando o arquivo chegar

1. Ler integralmente; registrar aqui sem alterar o conteúdo.
2. Preservar nomes, IDs 4.2.1–4.2.10 e módulos A–J.
3. Identificar os cinco Prompts Mestres e mapear cada um a entregas e módulos.
4. Matriz de rastreabilidade: requisito → módulo → entrega → Prompt Mestre → dependência →
   critério de aceitação → evidência.
5. Comparar com a fundação (`docs/foundation/FOUNDATION_REPORT.md` §E) e com a metodologia
   (`docs/product/CS2_PRO_PRODUCT_METHODOLOGY.md`); registrar conflitos reais.
6. Classificar cada entrega: possível com a arquitetura e os dados atuais × exige novas capacidades
   (ex.: posições, L04, classificador de compra).
7. Preencher `docs/checkpoints/PHASE_{1..5}_CHECKPOINT.md` somente se os cinco Prompts Mestres
   forem confirmados como as cinco fases do protocolo de continuidade.

**A Fase 4.2 não está pronta para implementação** enquanto este arquivo não for lido.

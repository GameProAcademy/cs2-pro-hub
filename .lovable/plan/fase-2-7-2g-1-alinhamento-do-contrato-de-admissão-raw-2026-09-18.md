# Fase 2.7.2G.1 — alinhamento do contrato de admissão RAW

## Objetivo
Corrigir somente incompatibilidades comprovadas entre a evidência RAW produzida, o manifest persistido e a admissão final no APP, preservando todos os dados, gates e o artifact Cache existente.

## Implementação
- Consolidar a validação server-side dos mappings em uma única regra tipada baseada no contrato oficial `reason: string | null`.
- Exigir justificativa não vazia para `RAW_ONLY_INTENTIONAL`; manter `PARSE_FAILED`, gates `FAIL/BLOCKED`, razões existentes, inventário incompleto e campos desconhecidos em fail-closed.
- Manter `UNMAPPED_BUT_AVAILABLE` bloqueado como gap real de cobertura, mesmo quando possui justificativa.
- Aplicar a mesma decisão no finalize do artifact e na verificação antes do Canonical, eliminando divergências entre `reason` e `reason_present`.
- Rejeitar seções/chunks desconhecidos ou metadados físicos inválidos antes de validar hash chain e root digest.

## Diagnóstico e testes
- Registrar o estado real read-only do job/artifact Cache e classificar os motivos do manifest preservado.
- Adicionar testes comportamentais para reason válido/vazio/null, UNMAPPED, PARSE_FAILED, gates, razões, evidência incompleta, digest, inventário vazio, campos desconhecidos e contrato legado.
- Executar testes RAW/pipeline, suíte APP, typecheck, diff check e build; parser somente será alterado/testado se a evidência exigir.

## Limites
- Não alterar banco, dados históricos, artifact original, Railway, parser sem necessidade comprovada, integrações ou UI.
- Não executar Cache Run 1 nem Run 2 nesta fase.
- Não iniciar a Fase 2.8 nem enfraquecer qualquer gate.

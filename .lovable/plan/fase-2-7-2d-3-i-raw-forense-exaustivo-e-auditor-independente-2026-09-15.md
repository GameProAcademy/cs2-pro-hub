# FASE 2.7.2D.3-I — RAW forense exaustivo e auditor independente

## Objetivo
Fechar no código a fronteira fail-closed entre o parser e o Canonical, preservando todo material retornado e exigindo auditoria independente comprovável, sem demo real nem alterações no Railway.

## Implementação
1. **Contrato forense explícito**
   - Evoluir o modelo RAW para distinguir disponibilidade, retorno, preservação, mapping, derivação, ausência, indisponibilidade e falha.
   - Registrar cobertura `COMPLETE`, `LIMITED` ou `SAMPLE` sem transformar limitações do parser em falsa exaustividade.

2. **Inventários baseados na evidência real**
   - Separar eventos disponíveis, eventos selecionados e eventos extraídos.
   - Preservar objetos brutos e todos os campos retornados de header, eventos, player info, game state/ticks, granadas, usercmd, movimento, times, placar, rounds, bombas, dano, mortes, armas e agregados.
   - Classificar qualquer material desconhecido como `UNMAPPED_BUT_AVAILABLE` e bloquear admissão.

3. **Auditor independente fail-closed**
   - Auditar diretamente a estrutura RAW armazenável, sem confiar nos gates/status produzidos pelo parser.
   - Validar manifest, identidade e versões, coerência de inventários, returned versus preserved, mappings, falhas de parse, cobertura e semântica de amostragem.
   - Introduzir status de admissão `PENDING`, `BLOCKED` e `APPROVED`; ausência de auditoria, inventário ou prova nunca aprova.

4. **Imutabilidade e defesa do Canonical**
   - Versionar evidência por tentativa e versão, impedindo overwrite silencioso e preservando tentativas anteriores.
   - Manter a primeira defesa em `processJob()` e reforçar a consulta da aprovação persistida antes da escrita Canonical.
   - Preservar claim, heartbeat, lease, retry, cancelamento e stale-worker protection.

5. **Banco, testes e documentação**
   - Criar e aplicar migration mínima para versionamento/imutabilidade e status explícito, com privilégios restritos.
   - Cobrir os 18 casos obrigatórios e os dois fluxos sintéticos de integração RAW → auditoria → Canonical.
   - Atualizar documentação e roadmap: H superseded por I; I implementada, mas não fechada até revisão; E2E real continua pendente.

## Restrições
- Não processar demo real nem invocar `/v1/parse`.
- Não alterar Railway, seus secrets, branch ou deployment.
- Não tocar no job Cache nem avançar Metrics, Features, DNA, Diagnosis ou AI Coach.
- Não declarar exaustividade onde a versão atual do demoparser2 não permite enumerá-la.

## Validação
- Testes TypeScript focados e suíte Python RAW/worker.
- Checagem de tipos, compilação Python, integridade do diff e build automático.
- Inspeção read-only final das constraints, grants e proteção Canonical.

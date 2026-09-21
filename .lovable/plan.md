# F.2.10-F–H — runtime real, auditoria de campos, paridade e determinismo

## Objetivo
Completar o harness auditável para executar o mesmo DEM real no WASM e no Python, comparar cada campo e provar determinismo sem inferir resultados ausentes. Como não há DEM real autorizado disponível, todas as provas de parsing permanecem `NOT_RUN` e o marco termina fail-closed.

## Implementação
1. **Contrato de evidência runtime**
   - Registrar por API duração, tamanho e digest normalizado, além de presença, tentativa, sucesso e erro.
   - Manter `parseHeader`, `listGameEvents`, `parseEvent` e `parseTicks` como gate mínimo; registrar `parseGrenades` separadamente quando disponível.
   - Preservar tick probe bounded como probe, nunca como domínio completo.

2. **Auditoria field-by-field**
   - Expandir catálogo para header, jogadores, identidade, eventos, rounds, teams/score, bomb, grenades, weapons/economy, position/movement, aim, health/armor, timing e aggregates.
   - Produzir linhas individuais com disponibilidade, tipos, null, samples normalizados, igualdade, classificação, motivo, referência de evidência e elegibilidade Canonical sempre bloqueada.
   - Registrar eventos descobertos, parseados e semanticamente validados como estados distintos.

3. **Paridade e determinismo**
   - Preparar referências locais Python/WASM vinculadas ao mesmo SHA-256 de DEM e comparação normalizada sem ocultar null, tipo ou valor divergente.
   - Preparar execução repetida e comparação de digests independentes para Python e WASM.
   - Sem DEM autorizado, emitir `NOT_RUN — NO_AUTHORIZED_REAL_DEM_FIXTURE` em vez de fabricar fixtures ou resultados.

4. **Segurança, testes e documentação**
   - Endurecer validator e testes negativos para artefato/hash/identidade/API/output inválidos e payloads proibidos.
   - Executar testes focados e completos, typecheck, lint, testes Python disponíveis e validação automática do projeto.
   - Atualizar relatórios, matriz, README e roadmap com a decisão `POC_NOT_READY`, Canonical bloqueado e nenhuma mutação produtiva.

## Limites
- Feature flag continua desligada por padrão.
- Nenhum Cache Run, retry, attempt 9, enqueue, claim, Canonical, Storage, banco, migration, secret, Railway ou histórico será alterado.
- Nenhuma evidência runtime, paridade, determinismo, performance ou compatibilidade será marcada como PASS sem um DEM real autorizado.

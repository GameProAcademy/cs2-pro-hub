# F.2.10-E–H — WASM real, DEM real e paridade forense

## Objetivo

Levar a POC existente até a máxima evidência verificável do `demoparser2` 0.42.0 no navegador, sem alterar produção, Railway, histórico, Storage ou Canonical e sem converter fixtures sintéticas em prova real.

## Execução

1. **Fechar provenance e build reproduzível**
   - Verificar o upstream exatamente na tag `v0.42.0` e commit `d3767705dc5846d73ed29db50eaeda58778dc934`.
   - Criar um script auditável para produzir e validar o binding `no-modules` e o binário WASM, registrando toolchain, tamanhos e hashes reais.
   - Se o build não puder ser reproduzido, registrar a ferramenta/comando/erro exatos e manter F.2.10-E bloqueada.

2. **Endurecer a inspeção e execução do runtime**
   - Preservar o Classic Worker e exigir `parseHeader`, `listGameEvents`, `parseEvent` e `parseTicks` no gate mínimo.
   - Separar, por API, export presente, chamada tentada, sucesso e falha sanitizada.
   - Validar binding/binário por origem, hash e identidade antes de executar qualquer DEM.

3. **Preparar a auditoria real campo a campo**
   - Expandir o contrato de evidência para header, players, eventos, rounds, ticks, tempos, bomba, granadas, armas, economia, posição, mira, score e times.
   - Manter tick probe determinístico e limitado; nunca declarar domínio completo ou autoritativo.
   - Preservar diferenças entre ausente, indisponível, falha de parse, nulo e valor real, inclusive zero.

4. **Preparar e executar paridade somente com corpus autorizado**
   - Procurar um `.dem` real autorizado no repositório sem criar, renomear ou baixar corpus arbitrário.
   - Se houver DEM e WASM válidos, executar duas vezes no navegador e duas vezes no Python 0.42.0 sobre o mesmo SHA, gerando matriz por campo e prova de determinismo.
   - Se faltar qualquer pré-condição real, manter F.2.10-G/H e paridade como bloqueadas/não executadas.

5. **Fail-closed, testes e documentação**
   - Expandir testes negativos para artefato, hashes, identidade, exports, falhas de APIs, DEM inválido/truncado, payload forjado, valores não finitos e alegações de cobertura.
   - Manter limite de 128 MiB, feature flag desligada, resultado limitado, validator obrigatório e `CANONICAL_ADMISSION = MUST REMAIN BLOCKED`.
   - Atualizar `roadmap.md`, criar o relatório de runtime e a matriz campo a campo, separando claramente testes sintéticos de evidência real.
   - Executar os gates TypeScript, testes APP/parser, lint, build e validações de integridade aplicáveis.

## Limites técnicos

- Nenhuma operação em Cache Run, retry, attempt 9, filas, Canonical, banco, Storage, Railway, secrets ou dados históricos.
- Nenhum pacote Node/native ou WASM 0.15 será tratado como runtime browser 0.42.0.
- Nenhum hash, export, campo, desempenho, compatibilidade ou PASS será inferido sem execução observável.
- Artefatos binários de build ficam fora do código-fonte até terem provenance e hashes verificáveis; somente o processo reprodutível e seus manifests auditáveis entram no projeto.

## Resultado esperado

Relatório formal para F.2.10-E/F/G/H, paridade, determinismo, navegadores, limites, Canonical e AI data. Cada item usará apenas `PASS`, `PARTIAL`, `BLOCKED`, `NOT_RUN`, `NOT_AVAILABLE` ou `PARSE_FAILED`, com os bloqueadores restantes explícitos.
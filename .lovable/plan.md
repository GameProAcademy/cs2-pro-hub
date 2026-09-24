# Fase 2.7.2H — Large DEM Client-Side Hybrid Readiness

## Objetivo
Preparar o fluxo local para DEMs grandes com limites explícitos, hashing incremental em Worker e uma fronteira de entrada substituível, sem aumentar o teto de parsing de 128 MiB nem liberar DEM real, attestation, Attempt 9+, Canonical ou Railway.

## Estado confirmado
- O POC já executa o parser/WASM em Worker, mas hoje lê o arquivo inteiro e calcula o hash no main thread antes de transferir o `ArrayBuffer`.
- O Worker recebe um buffer contíguo e o demoparser2 0.42.0 exige `Uint8Array`; não existe suporte comprovado a parsing por chunks ou stream.
- O hashing separado para DEM grande já usa `File.slice()` em chunks de 8 MiB, Worker, progresso e cancelamento.
- O teto local permanece 134.217.728 bytes; tamanhos maiores são apenas boundaries metadata-only.

## Implementação
1. **Contrato de capacidade do parser**
   - Criar uma capacidade explícita (`CONTIGUOUS_BUFFER`, `CHUNKED_FILE`, `STREAM`, `REMOTE_STREAM`, `UNKNOWN`).
   - Registrar o runtime atual como demoparser2 0.42.0, WASM, `CONTIGUOUS_BUFFER`, `requiresContiguousBuffer=true` e streaming não suportado.
   - Validar identidade e capacidade desconhecida de forma fail-closed.

2. **Fronteira única de entrada**
   - Encapsular a conversão integral `File -> ArrayBuffer -> Uint8Array` em um adapter usado somente pelo Worker do parser.
   - Enviar o `File` ao Worker por structured clone, sem materializar o DEM inteiro no React/main thread.
   - Preservar transferência de ownership onde houver `ArrayBuffer` e registrar que WASM/parsing ainda podem criar cópias internas não mensuradas.

3. **Hash e protocolo de Worker**
   - Integrar o SHA-256 incremental existente ao fluxo local antes do parser, com chunks de 8 MiB, progresso, cancelamento e erros controlados.
   - Remover o hash integral no main thread e evitar devolver bytes brutos ao React.
   - Endurecer validação de mensagens e o protocolo `INIT`, `PROGRESS`, `RESULT`, `ERROR`, `CANCELLED`; cancelamento continuará terminando o Worker, pois chamadas WASM síncronas não são interrompíveis cooperativamente.

4. **Gate e modelo de memória**
   - Implementar avaliação determinística com estados `SAFE`, `CAUTION`, `BLOCKED`, `NOT_SUPPORTED`, `NOT_RUN`.
   - Avaliar tamanho, capacidade do adapter, teto configurado, Worker/WASM, flag experimental, parser real e medição confiável disponível.
   - Separar tamanho do arquivo, buffer contíguo conhecido e overheads WASM/parser/resultado desconhecidos; qualquer multiplicador será marcado `HEURISTIC`, nunca medição.
   - Manter todos os arquivos acima de 128 MiB bloqueados para parsing, inclusive 473.748.061 bytes.

5. **Interface existente**
   - Integrar metadata, progresso do hash, estado de viabilidade, motivo factual, capacidade do parser, execução em Worker e cancelamento ao POC existente.
   - Não criar uma segunda tela de upload e não alterar o pipeline remoto existente.

6. **Proteções e documentação**
   - Adicionar testes estáticos contra leitura integral em React/service, bytes brutos em mensagens de resultado/logs e regressões de persistência.
   - Criar `docs/release-gates/LARGE-DEM-CLIENT-SIDE-READINESS.md` com arquitetura antes/depois, memória, capacidades e classificações obrigatórias.
   - Registrar no roadmap que `LARGE_DEM_REAL_EXECUTION_STATUS=BLOCKED`, R5.8.1 segue `BLOCKED_OPERATOR_CONFIGURATION`, e todas as autorizações permanecem em zero.

## Validação
- Cobrir 0, 1, 128 MiB−1, 128 MiB, 128 MiB+1, 300 MiB, 400 MiB, 500 MiB e 473.748.061 bytes sem alocações gigantes.
- Cobrir acceptance/rejection, hash metadata, adapter, protocolo, cancelamento, mensagens malformadas, identidade inválida, capacidade desconhecida e `NOT_SUPPORTED`.
- Executar testes focados de parser/Worker/boundary, TypeScript, lint, suíte completa e confirmar o build automático.
- Auditar que nenhum raw DEM, secret ou credencial foi persistido/logado e que nenhum gate de attestation ou Canonical mudou.

## Locks preservados
- `FEATURES.realDemoParser=false`; teto de 128 MiB inalterado.
- DEM real, upload real, parity, determinism e primeira attestation permanecem `NOT_RUN`.
- R5.8.1, HMAC PostgreSQL, secrets, GitHub OIDC, Railway, EnvironmentPatch e staging permanecem inalterados.
- Attempt 9/10+ e Canonical permanecem bloqueados; nenhuma migration ou nova infraestrutura.

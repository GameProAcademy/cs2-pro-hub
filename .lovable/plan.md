# F.5.3-CLOSURE.8-R11.2 — execução integrada descartável

## Objetivo
Substituir os probes R11.1 por uma execução descartável integrada e verificável, mantendo produção, Railway, DEM real, Cache, Canonical e Attempt 9+ bloqueados.

## Implementação
- Criar um harness modular chamado pelo entrypoint atual para operar exclusivamente no stack local do GitHub Actions.
- Executar o fluxo correlacionado upload → job → PGMQ → Worker A → parser real → RAW/chunks → Storage/read-back → HOT → terminalização → ACK/PostgREST.
- Executar e registrar FINISHED, falha real, PROCESS_ABORTED, replay/idempotência, SIGKILL pré-ACK e recuperação por um processo Worker B novo.
- Gerar matrizes por operações observáveis: 16 corrupções RAW, 50 corridas e 50 falhas, todas com identidade, proveniência e digests antes/depois.
- Incorporar resultados reais de Docker, navegador e testes do parser na evidência, sem transformar intenção ou probe isolado em PASS.

## Verificação independente
- Atualizar o verificador puro para validar versão 12, 18 gates, unicidade, contagens, correlação, digests, timestamps e locks.
- Adicionar testes negativos do verificador para evidência ausente/adulterada, proveniência divergente, matrizes insuficientes/duplicadas, conclusão incompleta e lock violado.
- Separar o CI em Job A de execução e Job B dependente para baixar o artefato, recalcular hashes e emitir a atestação final após Job A.

## Execução e decisão
- Enviar a implementação pelo fluxo normal do projeto e acompanhar o novo GitHub Actions.
- Inspecionar jobs, logs e artefato; corrigir e repetir enquanto houver falha reproduzível.
- Declarar `CLOSED` apenas se toda a prova R11.2 passar no mesmo run; caso contrário, manter `BLOCKED` com o bloqueador exato.

## Restrições preservadas
- `realDemAuthorized=false`, `canonicalAuthorized=false`, `railwayAuthorized=false`, `productionWrites=false`.
- Nenhuma operação em produção ou Railway; nenhum DEM real, Cache, Attempt 9/10+ ou reutilização de evidência histórica.

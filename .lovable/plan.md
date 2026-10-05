# Bridge Claim Recovery — Final Execution

## Objetivo
Comprovar a recuperação operacional do bridge claim e da fila durável, preservando todos os bloqueios de segurança e sem executar Attempt 9 ou DEM real.

## Execução
1. Confirmar o estado atual do backend, fila `demo_parse`, RPCs instaladas, assinaturas, permissões e compatibilidade com a versão real do PGMQ.
2. Correlacionar registros do endpoint, banco e Railway para localizar a exceção histórica e verificar se o erro 500 persiste.
3. Aplicar correção mínima somente se houver causa atual comprovada e reproduzível; não alterar dados históricos, mensagens, RAW, Storage, Canonical ou segredos.
4. Com a fila vazia, testar o endpoint autenticado real e exigir HTTP 200 com resposta contratual válida, sem mascarar erros.
5. Validar de forma não destrutiva os contratos de heartbeat, fail e complete; nenhuma identidade real será consumida ou fabricada.
6. Executar as suítes locais aplicáveis de R11.2, worker, parser e qualidade sem DEM real.
7. Reconciliar as evidências: polling Railway, ausência de 500 persistente, R11.2, attestation, Canonical e Attempt 9, mantendo `NOT_PROVEN/BLOCKED` onde não houver prova objetiva.

## Limites obrigatórios
- Não executar Attempt 9, DEM real, novo upload/job/match ou nova mensagem.
- Não limpar ou arquivar fila, apagar dados, alterar Canonical, promover gates ou reutilizar evidência antiga.
- Não alterar Railway, secrets ou arquitetura sem causa comprovada.
- Se o acesso aos logs Railway não estiver disponível, registrar exatamente essa fronteira externa; o endpoint e banco ainda serão validados até o limite seguro.

## Critério de saída
- `/api/public/pipeline-worker/claim` autenticado retorna HTTP 200 e payload válido.
- Estado da fila e do backend está saudável e coerente.
- Polling Railway e ausência de novos 500 são comprovados por logs, ou classificados como dependência externa com evidência precisa.
- Attempt 9 e Canonical permanecem bloqueados; DEM real permanece não executada.

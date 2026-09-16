# Marco de recuperação controlada da Tentativa 4

## Objetivo
Confirmar o estado real da Tentativa 4 sem criar duplicidades e corrigir somente o regression guard da configuração pública.

## Execução
- Classificar o job usando estado, lease, heartbeat, worker e mensagem da fila.
- Não executar recuperação enquanto o lease e o heartbeat indicarem posse ativa.
- Ajustar `scripts/verify-public-build-config.mjs` para validar estruturalmente o contrato real de configuração pública, sem alterar cliente, configuração, autenticação ou dependências.
- Executar `npm run verify:public-build` e `npm test`.
- Registrar no roadmap o resultado e as garantias de preservação.

## Limites
- Nenhuma Tentativa 5, upload, migration ou RPC nova.
- Nenhuma alteração em dados históricos, Canonical, RAW, Railway, parser ou worker.
- Nenhum update manual em jobs.

## Critério deste marco
O guard deve passar com o código real, e o job será apenas observado enquanto estiver `ACTIVE_VALID_LEASE`.

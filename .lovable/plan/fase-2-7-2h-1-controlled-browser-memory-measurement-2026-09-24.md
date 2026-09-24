# Fase 2.7.2H.1 — Controlled Browser Memory Measurement

## Objetivo
Adicionar ao POC existente um laboratório interno, desligado por padrão, que mede somente a materialização contígua de fixtures sintéticos no navegador e no Worker. Nenhum DEM real será aceito, processado, enviado ou persistido.

## Implementação
1. Criar contratos tipados para disponibilidade, resultados, erros, evidência e cleanup, limitados a metadados serializáveis.
2. Criar factory determinística de fixtures sintéticos nos tamanhos 16/32/64/96/128 MiB, com rejeição fail-closed acima de 128 MiB.
3. Criar Worker dedicado que reutiliza o adapter existente de materialização contígua, não chama o parser/WASM e retorna apenas byteLength, duração e status.
4. Implementar o controlador local com gate de feature/API/contexto seguro/isolamento, amostras observadas, timeout de 60 s, cancelamento, encerramento do Worker e cleanup.
5. Integrar uma seção “Experimental — Browser Memory Lab” ao POC existente, escondida quando a flag estiver desligada, com execução manual, até três repetições, tabela local e cópia de relatório somente metadata.
6. Adicionar testes unitários e estáticos para limites, schema sem binários, protocolo, cancelamento, timeout, cleanup e isolamento de parser/backend/analytics/storage.
7. Documentar método, limitações e status `MEASUREMENT NOT YET EXECUTED`; atualizar o roadmap sem alterar gates existentes.

## Validação
Executar testes focados e completos, TypeScript e lint; confirmar o build automático. A medição real no navegador continuará `NOT_RUN` até execução manual em runtime compatível.

## Locks preservados
- `CLIENT_DEMO_MAX_BYTES = 128 MiB`; `FEATURES.realDemoParser=false`.
- DEM real, Cache real, Attempt 9/10+, Canonical e primeira attestation permanecem bloqueados/não executados.
- R5.8.1, HMAC, secrets, Railway, banco, Storage e migrations permanecem inalterados.
- Nenhuma conclusão de suporte de produção ou de memória do parser/WASM.

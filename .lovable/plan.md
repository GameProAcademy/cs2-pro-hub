# H.3-E.9.1-R4.1-C/F — fechamento controlado da cadeia de execução

## Resultado pretendido

Preparar o registro confiável das tentativas de execução em todos os caminhos do parser, sem executar demos nem ativar autoridade operacional. O estado permanecerá **BLOCKED / FAIL-CLOSED / DIAGNOSTIC-ONLY** até provas completas e auditoria independente. Não serão alterados Railway, EnvironmentPatch, segredos, attestation, Canonical ou registros de execução de produção.

## Etapas

1. **Contrato de eventos e banco descartável.** Desenhar os campos tipados, a serialização canônica versionada e o digest SHA-256 calculado pelo banco. Reconciliar restrições antigas de maneira condicional, sem reescrever linhas. Construir harness PostgreSQL descartável para testar transições, idempotência, conflitos, concorrência real e privilégios, sem tocar no ledger de produção.
2. **Ponte autenticada.** Criar protocolo `H3E91_EXECUTION_BRIDGE_V1` em rota de servidor própria, com autenticação obrigatória, limites, validação estrita, respostas determinísticas e nenhuma credencial de banco no Railway. Rejeitar chamadas não autenticadas, replay conflitante, falhas de transporte e dados sensíveis.
3. **Instrumentar todas as superfícies antes de habilitar o escritor.** Na APP, registrar INTENT antes do adaptador remoto; no worker durable e em `/v1/parse`, propagar a mesma identidade, registrar STARTED imediatamente antes do parser e terminal após sucesso/falha. Falha na cadeia antes da execução deve impedir o parser. Falha terminal deve bloquear sucesso e preservar evidência de STARTED. Preservar o browser POC inacessível e a CLI de referência fora da imagem.
4. **Writer controlado por último.** Somente após instrumentação revisada de cada caminho, criar migration aditiva com `public.h3e91_record_execution_event(...)`, parâmetros tipados, `SECURITY DEFINER`, `search_path=''`, privilégios de EXECUTE mínimos e nenhum INSERT direto. O banco validará lifecycle sob lock transacional por execution_id, event_id idempotente e digest próprio. Não testar escrevendo na produção.
5. **Auditoria e gates.** Expandir discovery e testes de injeção de falhas, segurança de roles/RLS/triggers/índices, build do browser, isolamento da imagem, CI e checkpoint legível por máquina. Autoridade jamais será promovida por código local ou tabela vazia; paridade do deployment Railway continuará UNKNOWN sem auditoria externa. Atualizar roadmap, relatório do gate e decisões arquiteturais.

## Critérios verificáveis

- Provas sintéticas e PostgreSQL descartável para transições, conflitos, idempotência, concorrência e falhas de bridge/writer em cada superfície; lint, typecheck, build, suites web e Python/CI sem mascarar falhas.
- Consultas **somente leitura** para confirmar ledger de produção sem novos eventos, grants restritos, owner/SECURITY DEFINER/search_path, RLS, políticas, trigger, constraints e índices depois da migration.
- Se qualquer caminho, prova, configuração segura ou paridade implantada permanecer ausente, registrar o blocker exato e entregar **BLOCKED**, nunca PASS ou autorização de DEM.

## Detalhes técnicos

O writer deve distinguir `INSERTED`, `IDEMPOTENT_REPLAY` e `REJECTED` e serializar de modo determinístico UUIDs, strings, timestamps e `null`. O lifecycle permitido é INTENT → STARTED → FINISHED/FAILED/ABORTED, ou INTENT → ABORTED. Restringir EXECUTE a um principal server-side; rejeitar mutations diretas inclusive de service_role e sandbox_exec. Nenhum segredo, URL assinada, byte de DEM ou saída bruta do parser entrará em eventos, logs ou respostas da ponte.
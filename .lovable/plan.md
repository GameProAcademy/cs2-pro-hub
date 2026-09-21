# Hardening final do harness DEM real F.2.10-F/H

## Objetivo
Deixar o harness preparado para a futura execução controlada de um DEM real autorizado, sem fabricar evidência e sem liberar Canonical ou AI Data Readiness.

## Implementação
- Individualizar o catálogo field-by-field com estados explícitos desde suporte upstream até validação semântica, igualdade e elegibilidade canônica sempre falsa.
- Criar catálogo por evento dos campos realmente solicitáveis e ligar catálogo → requisição `parseEvent` → resultado → auditoria, preservando ordem e duplicidade da descoberta.
- Tornar `parseGrenades` auditável com contagem, amostras limitadas, inventário de campos, digest e estado semântico, usando os nomes reais do runtime.
- Formalizar contratos bounded para referência Python, evidência de eventos e execuções de determinismo; cada execução carregará SHA do DEM, identidade do parser/artifact e digest normalizado.
- Endurecer normalização e comparadores para preservar `null`, zero, `false`, strings vazias, tipos, ordem semântica, indisponibilidade e falha de parsing.
- Manter os limites atuais: DEM 128 MiB, resultado 2 MiB, eventos 1024, amostras 1000, jogadores 128 e tick probe 4096.
- Ampliar validator e testes negativos para hashes, identidades, limites, eventos, grenades, conteúdo proibido e claims indevidos de domínio completo/Canonical.
- Atualizar roadmap e relatórios F.2.10 com separação clara entre infraestrutura pronta e provas reais não executadas.

## Validação
- Executar testes focados e completos com `bun run test`, lint, typecheck, formatação e compilação Python.
- Executar testes Python quando o ambiente os disponibilizar; registrar qualquer bloqueio honestamente.
- Confirmar novamente que nenhum DEM real autorizado está presente antes do relatório final.

## Restrições preservadas
- Nenhum DEM sintético, histórico ou de produção será usado.
- Nenhuma execução Cache, retry, attempt 9, fila, Canonical, produção, Storage, Railway, migration, secret ou alteração histórica.
- A flag continua desligada; `authoritativeTickDomain=false`, `canonicalAdmission=BLOCKED`, `persisted=false` e `AI_DATA_READINESS=BLOCKED`.
- Sem DEM autorizado: F.2.10-F permanece `BLOCKED / NOT_RUN`; F.2.10-G/H, paridade e determinismo permanecem `NOT_RUN`; estado final `POC_NOT_READY — NO_AUTHORIZED_REAL_DEM_FIXTURE`.

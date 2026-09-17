# Fase consolidada 2.7.2D.9–D.12 + início da 2.7.2E

## Objetivo
Fechar a cadeia `usuário → perfil → identidade externa → participante da demo → dados canônicos → métricas/features`, sem alterar RAW/HOT, sem inventar integrações e sem declarar E2E aprovado sem execução real.

## Estado auditado
- A base D.8 já existe: decisões append-only, histórico de nicknames, confirmação/rejeição de auto-match, seleção manual, RLS de leitura e concorrência por `expected_latest_event_key`.
- O revision lock do APP já aponta para `git:40ae4977e174f9a21b1394fb047b53fba2505e8b`; contrato permanece `1`.
- O job Cache reservado está `failed/failed`, tentativa lógica `7`, dispatch `0`, erro `PARSER_IDENTITY_MISMATCH`; o RAW artifact está `ready`, mas a auditoria está `blocked`. Não existe decisão de identidade nem match canônico para esse job.
- Lacuna crítica: `resolvePlayerAttachment()` impede seleção manual quando uma Steam conectada não aparece na demo.
- Lacuna crítica: métricas e projeção ainda são condicionadas a `steamId`; um participante manual sem Steam não consegue gerar dados player-scoped.
- Lacuna de modelagem: método, origem e confirmação ainda não estão separados de forma explícita; confidence usa `user_confirmed` como nível.
- Lacuna de UX: o modal automático não mostra equipe, método, fonte e confiança completos; o resultado manual não mantém um estado de sucesso persistente claro.
- Lacuna de cobertura: faltam testes comportamentais de concorrência/idempotência no banco e de propagação pelo `participant_key`; a suíte focada atual tem 111 testes aprovados e 1 fixture antiga com revision divergente.
- O Coach atual é demonstrativo e não consome dados reais; portanto o gate de segurança do AI Coach só pode ser preparado/fail-closed, não declarado integrado.

## Implementação

### 1. Consolidar o domínio de identidade
- Evoluir o resolvedor existente, sem criar um segundo engine.
- Permitir seleção manual quando não há Steam, quando a Steam não aparece na demo, após rejeição e em conflito.
- Preservar nickname apenas como contexto; nunca promovê-lo a evidência forte automática.
- Padronizar método (`steam_id_confirmed`, fontes reais futuras e `manual_user_selection`), fonte (`steam`, `faceit`, `gamersclub`, `user`, `multi_source`, `system`) e confiança (`high`, `medium`, `low`).
- Modelar separadamente confirmação (`pending_confirmation`, `user_confirmed`, `user_rejected`, `not_required`, `manual_selected`).
- Manter FACEIT somente quando houver evidência real já persistida e Gamers Club preparado/desativado enquanto indisponível.

### 2. Endurecer persistência, concorrência e histórico
- Criar somente migration incremental para ampliar constraints/colunas necessárias; nenhuma recriação ou remoção.
- Preservar decisões append-only e tornar confirmação/rejeição/seleção uma state machine validada pelo banco.
- Manter `expected_latest_event_key`, lock do job e chaves idempotentes estáveis para refresh, double-click e múltiplas abas.
- Garantir que rejeição automática não reapresente a mesma sugestão sem nova evidência.
- Completar provenance do histórico, mantendo nickname original e normalizado, deduplicação por jogador+nickname normalizado e incremento uma vez por contexto/job.
- Preservar RLS owner-only e execução privilegiada apenas nas funções server-side com ownership validado.

### 3. Corrigir propagação player-scoped
- Introduzir um alvo resolvido que carregue separadamente `playerProfileId`, `participantKey` e Steam opcional.
- Fazer métricas e features selecionarem eventos/rounds/economia pelo `participantKey` real, não pelo perfil, nickname ou posição no array.
- Permitir projeção manual mesmo quando o participante não tem Steam, sem fabricar um identificador externo.
- Persistir o vínculo no participante canônico correto e impedir projeções quando a identidade estiver unresolved/conflict/awaiting confirmation.
- Manter RAW imutável e HOT intacto; preservar AIM, posição, economia e utility em metadata canônica, sem transformá-los em eventos artificiais.
- Adicionar guard explícito para qualquer contexto futuro do Coach: somente dados do perfil + participante resolvido; caso contrário, estado indisponível.

### 4. Completar a UX e diagnóstico
- Ajustar o modal existente para refletir estados válidos, mostrar nickname, equipe, método, fonte e confiança.
- Após rejeição, abrir imediatamente seleção manual; após sucesso, mostrar a associação persistida e seu método real.
- Exibir todos os participantes reais e metadados disponíveis, com confirmação desabilitada sem escolha.
- Manter os cinco idiomas, mobile e acessibilidade.
- Ampliar a visualização administrativa existente apenas com os campos necessários de identidade e gates, sem novo painel paralelo.

### 5. Testes e segurança
- Cobrir os 19 cenários exigidos com testes comportamentais onde possível: matriz automática/manual/conflito, método versus confirmação, stale/double submit, histórico, ownership, participant correto em Canonical/métricas/features e bloqueio do Coach.
- Corrigir a fixture de revision para o lock atual sem enfraquecer a validação.
- Executar testes TS focados e completos, suíte Python RAW/HOT/parser, typecheck, lint aplicável, build e linter de segurança.
- Revisar os findings atuais do banco; corrigir apenas os relacionados a esta implementação e reportar separadamente os legados.

### 6. Validação real e gates
- Validar primeiro `/health` e `/version`, contrato `1`, revision exata e ausência de credencial privilegiada no parser.
- Não criar upload, job, tentativa ou mensagem duplicada; não editar status manualmente.
- Como o job Cache reservado já está terminal com mismatch e RAW bloqueado, só executar recuperação/reprocessamento por um caminho oficial existente que preserve tentativa/histórico e apenas se todos os gates prévios estiverem verdes.
- Se não houver caminho seguro ou acesso Railway suficiente, encerrar como `IMPLEMENTADO, MAS NÃO VALIDADO EM E2E`, indicando o bloqueador exato.

## Fora de escopo
- Nenhuma redução de RAW, sampling adicional ou remoção de AIM/POSITION/ECONOMY/UTILITY.
- Nenhuma integração fake, dado fictício, mudança de segredo ou service-role no Railway.
- Nenhum redesign do parser, mudança de contrato, alteração destrutiva ou correção de arquivos fora desta fase.

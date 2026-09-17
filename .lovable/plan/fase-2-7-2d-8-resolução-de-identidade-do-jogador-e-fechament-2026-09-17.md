# FASE 2.7.2D.8 — Resolução de identidade do jogador e fechamento E2E

## Objetivo
Completar o fluxo existente para responder com segurança “qual jogador desta demo sou eu?”, usando identidade forte quando disponível, seleção manual quando necessário, histórico contextual de nicknames e propagação correta para Canonical, métricas, features e AI Coach.

## Auditoria confirmada
- Preservar o resolvedor único `resolvePlayerAttachment()`, que já prioriza Steam confirmada, rejeita conflito e nunca promove nickname a identidade forte.
- Preservar `demo_jobs` como registro da associação por demo e o RPC transacional de reprocessamento; não criar arquitetura paralela nem alterar RAW/HOT/Railway.
- Preservar o fluxo manual existente e evoluí-lo de painel inline para decisão guiada; hoje o auto-match é silencioso e o histórico não mostra método, confiança, jogador ou equipe.
- Criar somente a estrutura ausente para histórico agregado de nicknames; `player_profiles.nickname` é apenas o nome atual e `demo_jobs.observed_nickname` registra somente uma observação isolada.

## Backend e dados
- Adicionar uma tabela de histórico contextual de nicknames com vínculo ao perfil, upload/match/job, nome original e normalizado, origem, método, confiança, contagem e primeira/última observação.
- Incluir grants, RLS por proprietário, índices e unicidade/idempotência na mesma migration; mutações continuarão exclusivamente em função autenticada com ownership validado no servidor.
- Evoluir o RPC existente de associação para registrar decisão automática sugerida, rejeição e confirmação manual sem perder evidência anterior e sem duplicar registros em retry, duplo clique, refresh ou duas abas.
- Centralizar a decisão no resolvedor existente: Steam confirmada pode auto-resolver; FACEIT/Gamers Club só entram quando houver evidência real e compatível; nickname permanece apenas evidência auxiliar/sugestão.
- Corrigir a consistência do participant key entre o parser normalizado e `match_participants`, sem inventar Steam ID nem permitir IDs arbitrários do cliente.
- Registrar o nickname somente após associação comprovada/confirmada e atualizar o histórico de forma idempotente; não reprocessar o `.dem` nem gerar novo RAW.

## Fluxo e interface
- Expor no contrato do job o estado, jogador, equipe, método, fonte, confiança e necessidade de confirmação.
- Após jogadores estarem disponíveis, abrir um diálogo acessível e responsivo:
  - auto-match forte: informar o jogador e a fonte real, com “Continuar” e “Não sou eu”;
  - sem match forte, identidade não encontrada ou conflito: mostrar todos os participantes compactos para seleção manual;
  - falha ao salvar: preservar a demo e oferecer nova tentativa com mensagem clara.
- Persistir rejeição da sugestão automática e permitir substituição manual somente para aquela demo, mantendo ambas as evidências auditáveis.
- Mostrar no histórico de demos o nickname, equipe e método real; adicionar “Nicknames usados” ao perfil com primeira/última observação, quantidade e origem, sem edição arbitrária.
- Adicionar traduções reais para pt-BR, en, es, fr e pt-PT, mantendo o design e os textos mobile existentes.

## Segurança e consistência
- Validar no servidor que job/upload/perfil pertencem ao usuário e que o participante pertence ao match associado ao job.
- Manter o cliente sem privilégios administrativos, sem secrets e sem acesso ao RAW.
- Tratar confirmação concorrente de forma transacional e idempotente, com resultado estável para retry e refresh.
- Registrar eventos estruturados sanitizados de resolução, fallback, conflito, rejeição e histórico, sem tokens ou dados sensíveis.

## Testes e validação
- Testar comportamento real do resolvedor: Steam encontrada, ausente, conflito forte, nickname auxiliar, dois nicknames parecidos, seleção manual, rejeição do auto-match e fontes futuras sem simulação.
- Testar RPC/serviços para ownership, participante fora do match, idempotência, duplo clique, retries e atualização do histórico.
- Testar a propagação do participante confirmado até Canonical, métricas e features sem duplicar match, RAW ou job.
- Testar diálogos, loading, erro, teclado, foco, mobile e traduções nos cinco idiomas; validar refresh e retomada.
- Rodar testes TypeScript focados e completos, testes Python do parser/RAW/HOT como regressão, typecheck, lint dos arquivos alterados, build e scan de segurança.

## E2E real e gates
- Não criar upload, job, tentativa ou mensagem para forçar o teste; não apagar/resetar dados.
- Verificar Railway `/health`, `/version` e revisão. Somente continuar o job Cache oficial existente por recovery/reconciliation já autorizado quando o worker sincronizado estiver comprovado.
- Validar o fluxo completo até estado terminal: participantes → identidade → Canonical → métricas → features → histórico/UX, preservando `attempt_number=7`, dispatch técnico e RAW imutável.
- Se Railway continuar sem identidade de versão/sync, entregar código e testes locais como PASS, mas manter o E2E real BLOCKED e a fase não concluída.

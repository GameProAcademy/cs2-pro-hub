# FASE 2.7.2B — hardening final, ambiente e histórico de demos

## Objetivo
Restaurar definitivamente a conexão do preview ao Lovable Cloud existente, criar históricos de demos derivados dos registros atuais e endurecer a evidência RAW sem alterar Canonical Match, Identity Resolver, TUS ou a UX de progresso.

## Implementação
- Consolidar a configuração pública do cliente para `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, mantendo as credenciais server-side separadas e sem fallback falso no navegador.
- Validar a autenticação real e os acessos de jogador/admin no preview; conferir também a disponibilidade do ambiente publicado sem declarar sucesso onde não houver publicação.
- Enriquecer a consulta existente de jobs com data, mapa, resultado e rounds somente quando comprovados pelos registros atuais; nenhum dado será inventado e nenhuma tabela duplicada será criada.
- Adicionar “Histórico de análises” em `/analysis`, com estados reais, campos indisponíveis explícitos e traduções nos cinco idiomas.
- Adicionar a aba “Demos” no detalhe administrativo, derivada de uploads, jobs e partidas existentes, preservando a aba técnica “Uploads” e toda autorização server-side atual.
- Restringir o parser ao inventário completo + conjunto selecionado de eventos de alto valor; ampliar campos de jogador, combate, armas, economia e estado do jogo quando disponíveis.
- Tornar a amostragem de ticks orientada por eventos, determinística e limitada a 4096 linhas, registrando contagens e tamanho estimado.
- Modelar estados explícitos de capability e do gate RAW→Canonical, exigir motivo em `RAW_ONLY_INTENTIONAL`, falhar em `UNMAPPED_BUT_AVAILABLE`/`PARSE_FAILED` e manter ausência distinta de vazio, zero e falso.
- Derivar `partial_parse` das capabilities e usar uma única fonte de verdade para `extraction_confidence`.
- Aplicar limite explícito de payload de evidência; payload excessivo falha sem truncamento silencioso.

## Segurança e dados
- Reutilizar exclusivamente o backend, usuários, tabelas, Storage, políticas e dados existentes.
- Histórico do jogador permanece limitado ao próprio usuário; histórico administrativo passa somente pelas funções administrativas existentes.
- Preservar `requireSupabaseAuth`, RLS, autorização fail-closed, `is_admin_master` e auditoria.
- Não criar mocks, dados falsos, novo banco ou nova entidade duplicada de upload.

## Testes e validação
- Cobrir configuração Vite, deduplicação do histórico, isolamento por usuário e acesso administrativo.
- Cobrir inventário versus seleção, eventos/campos de alto valor, estados de capability, limites e determinismo dos ticks, `NULL` sem coerção, `partial_parse`, confidence e gate RAW→Canonical.
- Executar suítes direcionadas e completas, checagem de tipos, lint e build.
- Verificar no navegador `/login`, `/register`, `/reset-password`, `/analysis`, `/admin`, `/admin/pipeline` e `/admin/demo-e2e`, incluindo login e recuperação de sessão quando houver sessão de teste disponível.

## Estado de fechamento
A fase ficará **IMPLEMENTED / NOT CLOSED**. Nenhum E2E real de demo será declarado sem percorrer Storage → worker real → evidência RAW → canônico → attachment → métricas/features → persistência/idempotência → limpeza. A FASE 2.8 não será iniciada.

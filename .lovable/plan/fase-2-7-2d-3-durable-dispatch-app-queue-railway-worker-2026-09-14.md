# FASE 2.7.2D.3 — Durable Dispatch APP → Queue → Railway Worker

## Objetivo

Substituir o processamento longo dentro da chamada do agendador por transporte durável com `pgmq`, mantendo `demo_jobs` como fonte de verdade. O Railway passa a consumir e processar mensagens persistentemente; o endpoint `/v1/parse` permanece disponível para diagnóstico/manual.

## Estado auditado

- O agendador atual ainda executa `claimNextJob()` e aguarda `processJob()` dentro da mesma requisição HTTP.
- `pgmq` não está habilitado e não há fila `demo_parse`.
- `demo_jobs` já concentra lifecycle, retry, heartbeat, cancelamento e ownership; os RPCs atuais usam locks transacionais e acesso exclusivo de servidor.
- O parser Railway é stateless, executa download + demoparser2 dentro de `/v1/parse` e não possui consumer persistente.
- O job Cache permanece `processing/parsing`; não será recuperado, reenfileirado, duplicado nem alterado nesta fase.
- O Railway não pode receber uma chave privilegiada gerenciada pelo Lovable Cloud. Por isso, o worker acessará a fila por uma ponte HTTP autenticada e estreita no APP; somente o APP tocará `pgmq` e o banco com privilégio elevado.

## Implementação

### 1. Banco e fila durável

- Criar uma única migration idempotente que habilita `pgmq` e cria `demo_parse`.
- Adicionar a `demo_jobs` apenas os metadados necessários de dispatch/attempt/lease, sem criar tabela de fila paralela.
- Criar RPCs `SECURITY DEFINER`, com `search_path = ''`, acesso somente de servidor e payload validado para:
  - enqueue/reconcile idempotente por `job_id + attempt`;
  - claim atômico de uma mensagem elegível;
  - renovação de visibility timeout + heartbeat;
  - conclusão/ACK somente após persistência confirmada;
  - rejeição/arquivo ou retry conforme a política existente;
  - cancelamento terminal sem redelivery infinito.
- Não conceder acesso do browser aos objetos internos de `pgmq`.
- Atualizar os checks permanentes de segurança e lifecycle.

### 2. Separar parsing da persistência existente

- Extrair de `processJob()` uma etapa que recebe um `RawParserOutput` já validado e executa o fluxo existente: RAW Evidence, normalização, resolução, persistência já implementada e finalização.
- Manter um único caminho de persistência; não portar nem duplicar Canonical em Python.
- Preservar os gates de identidade do parser, integridade SHA-256, limites, retry, cancellation e idempotência.
- O dispatch oficial deixa de chamar o POST longo `/v1/parse`.

### 3. Ponte autenticada APP ↔ Railway

- Adicionar endpoints públicos mínimos, autenticados por segredo dedicado e comparação segura, para o worker:
  - claim de uma mensagem;
  - heartbeat/renovação de lease;
  - conclusão com resultado validado;
  - falha/cancelamento controlados.
- O claim devolverá uma URL privada temporária somente no momento do consumo; ela nunca ficará na mensagem nem em logs.
- O resultado será aceito apenas para o `job_id + attempt + message_id` atualmente claimed; redelivery obsoleta será recusada sem duplicar persistência.
- Respostas e logs serão sanitizados; nenhum token, URL assinada, demo ou stack será exposto.

### 4. Railway persistent worker

- Refatorar o parser para compartilhar uma função interna entre `/v1/parse` e o novo consumer, preservando os três endpoints atuais.
- Adicionar loop persistente com backoff quando a fila estiver vazia, claim único, heartbeat periódico, renovação de lease e verificação de cancelamento antes, durante e depois do parsing.
- Executar download HTTPS sem redirects, streaming, limites, hash, magic bytes e cleanup como hoje.
- Enviar o resultado ao APP para o caminho único de persistência; ACK somente após confirmação durável.
- Em reinício/morte antes do ACK, deixar a visibility timeout permitir redelivery segura.
- Manter concorrência configurável e conservadora, inicialmente 1.

### 5. Agendador existente

- Remover somente o processamento longo de demos da requisição do agendador.
- Manter o mesmo endpoint e o mesmo agendamento para reconciliação curta, limpeza e FACEIT.
- A reconciliação apenas garante que jobs novos elegíveis estejam duravelmente enfileirados; não faz parse, não cria segundo cron e não usa `waitUntil()`.
- Ajustar recovery para coexistir com lease/heartbeat sem recuperar jobs vivos nem tocar no job Cache.

### 6. Configuração e documentação

- Documentar as variáveis server-side do Railway: URL da ponte, segredo dedicado, intervalos de poll/heartbeat/visibility, concorrência e identidade já existente do parser.
- Atualizar `.env.example`, `ENVIRONMENT.md`, README do parser e criar `docs/PHASE-2.7.2D.3-DURABLE-DISPATCH.md`.
- Registrar arquitetura, contrato da mensagem, lifecycle, retry, cancellation, observabilidade, testes, evidências, limites e estado de implantação.

## Testes obrigatórios

- Enqueue idempotente e claims concorrentes.
- Redelivery e reinício antes/depois da persistência e antes do ACK.
- Cancelamento antes do claim, durante parsing e antes da persistência final.
- Retry legítimo, teto de retry e stale job sem ressurreição fora da política.
- Heartbeat e renovação de visibility timeout.
- Payload sem `.dem`/URL assinada; logs sem segredos.
- `/health`, `/version` e `/v1/parse` preservados.
- Testes TypeScript e Python relevantes, lint, tipos, build e checks de segurança.
- Prova read-only de que o job Cache não mudou durante a implementação.

## Implantação e gate final

- Aplicar a migration e comprovar a existência da extensão, fila e RPCs sem inserir mensagem para jobs existentes.
- Preparar o serviço Railway e suas variáveis, mas declarar claramente qualquer bloqueio de acesso/configuração externa.
- Não executar nem reenviar demo existente.
- Sem um novo `.dem` autorizado, o resultado máximo será `IMPLEMENTATION COMPLETE / REAL E2E NOT YET PROVEN`; nunca marcar `CLOSED` sem queue → worker → RAW/persistência → ACK comprovados.
- Canonical novo e auditoria RAW forense continuam bloqueados; não avançar automaticamente para a próxima fase.

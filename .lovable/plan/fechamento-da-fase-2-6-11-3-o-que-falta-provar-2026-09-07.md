# Fechamento da FASE 2.6.11.3 — o que falta provar

A auditoria de hoje foi somente leitura: nada foi corrigido, nenhum arquivo alterado.
Build, preview, telas e suíte estão íntegros. Restam duas lacunas de PROVA (não de código).

## Situação verificada agora

- Build: OK. Preview responde (`/login` 200).
- Telas: visitante em `/`, `/login`, `/register`, `/reset-password` sem erros;
  jogador em `/dashboard`, `/matches`, `/profile`, `/upload` sem erros;
  `/admin` redireciona para `/dashboard`. Zero `ADMIN_FORBIDDEN`,
  zero `Unauthorized`, zero "This page didn't load".
- Suíte: 31 arquivos, 480 testes, todos passando.
- Único ruído: aviso de hidratação do React quando um visitante abre uma página
  protegida e é redirecionado para o login (dev-only, invisível ao usuário final).
- Banco: as tabelas canônicas estão VAZIAS (0 partidas, 0 observações,
  0 participantes, 0 identidades). As fixtures da prova anterior foram removidas,
  como planejado; ou seja, hoje não há nenhuma evidência viva no banco.

## Lacunas de prova (o que fecharia a fase)

1. **Concorrência paralela real** — nunca executada. Dois processos gravando a
   MESMA observação ao mesmo tempo. Hoje a garantia é apenas teórica (trava de
   transação + unicidade por fonte/id externo).
2. **Prova canônica reexecutável** — as provas de banco (anexo atômico, rollback,
   idempotência, RLS por usuário) foram feitas manualmente e depois apagadas.
   Não existe forma de reexecutá-las sem refazer tudo à mão.

## Proposta de trabalho (a executar só se você aprovar)

### 1. Rotina de prova canônica versionada
Um script de prova no repositório que: cria as fixtures, executa o caminho de
produção contra o banco real, verifica cada garantia (mesma partida canônica,
0 duplicações, rollback sem sobras, leitura restrita ao dono, escrita negada ao
aplicativo) e remove tudo ao final, imprimindo PASS/FAIL por item.
Assim a prova deixa de ser um relatório e passa a ser reexecutável.

### 2. Prova de concorrência de verdade
Duas gravações simultâneas da mesma observação, disparadas em paralelo pelo
caminho de produção do servidor (não pelo banco direto, que exige uma senha
indisponível aqui). Resultado esperado e verificado: 1 partida canônica,
1 observação por fonte, nenhuma linha órfã.
Se o ambiente não permitir a execução paralela, isso será declarado como
BLOQUEIO explícito no roadmap — não como aprovado.

### 3. Limpeza do aviso de hidratação no redirecionamento
Alinhar o que é renderizado no servidor e no navegador na volta ao login, para o
console ficar limpo também nesse caminho.

## Detalhes técnicos

- Script de prova: `scripts/canonical-proof.ts` (Bun), usando as funções de
  produção `persistCanonicalObservation` / `persistCanonicalSeriesObservation` e
  as consultas de verificação; cleanup por `match_id`/`series_id` em bloco final.
- Concorrência: `Promise.all` de duas invocações do caminho de produção com a
  mesma `(source, external_match_id)`; asserção sobre `observation_count`,
  contagem de `matches` e ausência de `match_sources` órfãos.
- Hidratação: alinhar detecção de idioma/bandeira no `AuthLayout`/seletor de
  idioma ao primeiro render do servidor.
- Nada de FASE 2.7, nada de reabrir worker FACEIT.

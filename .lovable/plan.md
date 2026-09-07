# FASE 2.6.11.4 — Prova final contra o banco real e fechamento da convergência temporal

Revisão do plano solicitada: nada foi alterado no código nesta etapa. Abaixo está o
plano completo, com os 24 pontos exigidos endereçados explicitamente (mapa de
cobertura ao final).

## O que a auditoria de hoje já confirmou (leitura, sem alteração)

- A prova reexecutável existe: `scripts/canonical-proof.ts` roda o caminho de
  produção contra o banco real (nada de banco falso) e hoje imprime
  12 PASS / 0 FAIL / 1 SKIPPED.
- Concorrência: seis gravações realmente paralelas da mesma observação já
  resultaram em 1 partida e 1 observação. Isso passa por seis requisições HTTP
  independentes ao banco, não por um laço sequencial; falta provar que cada uma
  ocupou uma sessão distinta do Postgres e que apenas UMA reportou "criada".
- Semântica temporal: divergência REAL confirmada. O DEMO usa o início da
  partida; o FACEIT usa `finished_at ?? started_at` como data da partida. Ou
  seja, hoje o comparador pode confrontar o início do DEMO com o fim do FACEIT.
- Múltiplos candidatos EXACT: confirmado que o resolvedor escolhe o de maior
  confiança e, em empate, o primeiro encontrado. Não existe hoje regra de
  ambiguidade para dois EXACT.
- Preview: o console está limpo tanto para visitante em rota protegida quanto
  para jogador autenticado no painel; não reproduzi `ADMIN_FORBIDDEN` nem
  `Unauthorized`. A investigação continua no plano para provar a origem.

## Trabalho proposto

### 1. Semântica temporal (correção obrigatória)
Comparação de identidade passa a usar o INÍCIO da partida em ambas as fontes:
para o FACEIT, `started_at`; para o DEMO, a data da partida, com a limitação de
origem documentada quando não houver garantia de que representa o início.
O fim (`finished_at`) continua servindo para duração e ciclo de vida, e deixa de
ser substituto silencioso do início na decisão de identidade. Regra registrada
na documentação da fase.

### 2. Dois candidatos EXACT viram ambiguidade
Zero EXACT: não anexa. Um EXACT: pode anexar. Dois ou mais EXACT: resultado
determinístico de conflito/ambiguidade e NUNCA anexo automático. Teste próprio,
mais o caso EXACT vs PROVÁVEL, em que o EXACT pode vencer.

### 3. Convergência cross-source real, sem atalhos
Prova que uma partida de DEMO e a MESMA partida no FACEIT convergem sem
identificador externo igual, sem impressão digital inventada e sem SteamID
inventado: só roster completo resolvido pelo Grafo de Identidade, mesmo mapa,
janela de início compatível e ausência de conflito. Esperado: 1 partida
canônica, 2 observações, 10 participantes, zero duplicatas e zero órfãos.

### 4. Grafo de Identidade real (três casos)
Fixtures de identidade criadas no banco: conta FACEIT → identidade → perfil →
identidade Steam → SteamID64, resolvidos pelo código de produção.
Caso A: identidade encontrada, apta a EXACT. Caso B: identidade ausente →
"identidade não resolvida", sem anexo. Caso C: falha de consulta → erro de
resolução explícito, jamais convertido em "identidade não encontrada".

### 5. Provas reais no banco (ampliação do script existente)
Verificação de credenciais no início, com aborto marcado como BLOQUEADO se
faltarem; fixtures isoladas por marcador exclusivo; provas; verificação lendo as
tabelas; limpeza no bloco final; e segunda consulta confirmando zero resíduo.
Gates: atomicidade e desfazimento total (falha forçada dentro do caminho
transacional real, sem sobras em nenhuma das tabelas), idempotência sequencial
(primeira execução "criada", seguintes não; contagem de observações correta; sem
participante, round ou evento duplicado), precedência de fonte (o FACEIT não
rebaixa fatos do DEMO; valor ausente não apaga valor existente), semântica de
ausência (desconhecido continua desconhecido, nunca falso nem zero), BO1, BO3
com mapas e BO3 somente-série (1 série, 0 partidas, observação ligada à série).

### 6. Concorrência com sessões independentes
Antes de afirmar qualquer coisa, verifico se o ambiente permite abrir sessões
Postgres realmente independentes. Se permitir, a prova roda com N sessões
simultâneas gravando a mesma observação e também DEMO+FACEIT ao mesmo tempo:
esperado 1 partida, 1 observação por fonte, apenas UMA "criada", zero órfãos.
Se o ambiente não permitir, o gate fica CONCURRENCY = BLOQUEADO, com o motivo
exato — sem banco falso, sem lock simulado, sem execução sequencial disfarçada,
sem senha embutida e sem afrouxar segurança.

### 7. Acesso: leitura, escrita e privilégios
Usuário A vê os próprios dados; usuário B não vê nem altera os dados de A;
anônimo não vê nada; inserção, atualização e exclusão diretas negadas para
usuário autenticado e anônimo nas tabelas canônicas; execução das rotinas
canônicas restrita ao papel de serviço, com caminho de busca seguro e
referências qualificadas. Nada é liberado para fazer prova passar.

### 8. Convergência negativa
Mesmo roster com mapa diferente; mesmo roster com tempo incompatível; roster
incompleto; placar contraditório quando confiável; identidade não resolvida;
falha de consulta de identidade; dois EXACT. Nenhum desses casos anexa.

### 9. Runtime real no navegador
`/`, `/login`, `/register`, `/reset-password`, `/dashboard`, `/matches`,
`/profile`, `/upload` e `/admin` para visitante, jogador comum e administrador.
Investigo a origem exata de `ADMIN_FORBIDDEN` e `Unauthorized` — separando a
consulta de interface (ausência de privilégio não é erro) da autorização
administrativa real, que continua fechada por padrão. Nada de engolir erro nem
enfraquecer autorização. Avisos não funcionais são reportados como AVISO — NÃO
BLOQUEANTE, nunca como "zero avisos".

### 10. Verificações e fechamento
Tipos, suíte completa (hoje 480 testes; o número real após os novos testes será
informado), lint e build, com os resultados reais. Só depois disso escrevo
`docs/PHASE-2.6.11.4-FINAL-DATABASE-PROOF.md` com PASS/FAIL/BLOQUEADO/NÃO
PROVADO por item e atualizo o roadmap. Se qualquer gate crítico ficar BLOQUEADO
ou NÃO PROVADO, o veredito NÃO será "pronto para a fase 2.7".

## Cobertura dos 24 pontos exigidos

1 → item 5. 2 → itens 3 e 4. 3 → item 1. 4 → item 5. 5 → item 5. 6 → item 6.
7 → item 6. 8 → item 7. 9 → item 7. 10 → item 7. 11 → item 2. 12 → item 8.
13 → item 4 (caso B). 14 → item 4 (caso C). 15 → item 5. 16 → item 5.
17 → item 5. 18 → item 5. 19 → item 5. 20 → item 9. 21 → item 9. 22 → item 10.
23 → item 5. 24 → item 10.

## Detalhes técnicos

- Timestamp: campo de comparação do resolvedor passa a ser o início canônico
  (`startedAt` quando existir, senão `playedAt`); `faceit.mapper.ts` mantém
  `match_date` para exibição, e o adaptador FACEIT expõe o início como
  referência de identidade. Nenhum campo redundante novo no banco.
- Resolvedor: `resolveAgainstAll` passa a contar candidatos EXACT e devolver
  conflito/ambiguidade quando houver mais de um; `canAttachAutomatically`
  permanece como único portão de anexo.
- Provas: extensão de `scripts/canonical-proof.ts` (Bun, apenas server-side, sem
  rota pública), com fixtures de `player_profiles` / `player_identities` para o
  Grafo de Identidade e limpeza por marcador da execução.
- Concorrência: investigar mecanismo de sessões independentes disponível; sem
  isso, gate declarado BLOQUEADO.
- Escopo fechado: nada de FASE 2.7, nada de reabrir Auth, Steam, FACEIT
  hardening, Gamers Club ou fases anteriores, exceto regressão causada por esta
  fase.

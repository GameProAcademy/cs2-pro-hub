# FASE 2.7.2B — Raw Demo Evidence & Full Coverage

## Objetivo

Criar uma camada persistente e auditável de evidência bruta entre o `demoparser2` e o contrato normalizado do APP, capaz de provar exatamente o que cada demo contém, o que foi extraído, o que está ausente e o que falhou — sem inventar valores e sem usar o Canonical Engine como depósito bruto.

## Fluxo final

```text
.dem real
  → demoparser2 / descoberta de capacidades
  → Raw Demo Evidence + Coverage
  → validação RAW-EVIDENCE-01
  → APP Raw Contract
  → normalizer
  → Canonical Engine
  → attachment opcional
  → metrics / features apenas quando permitidos
```

## Implementação

### 1. Contrato de evidência bruta
- Criar tipos versionados para `RawDemoEvidenceManifest`, `RawEventCoverage`, eventos brutos, cobertura de propriedades de jogador, ticks, granadas, economia e matriz RAW → contrato → canônico.
- Preservar campos parser-native em `raw_fields`, com `parser_source` e `source_index`, antes de qualquer redução ou renomeação.
- Implementar serialização e ordenação determinísticas.
- Tratar indisponível, consulta falha e stream vazio como estados distintos.
- Preservar `null/unknown` sem conversão para `0`, `false` ou string vazia.

### 2. Descoberta real no worker
- Consultar `list_game_events()` quando suportado e registrar o inventário completo.
- Tentar os eventos atuais e os eventos ampliados solicitados, sem assumir disponibilidade.
- Registrar para cada stream: disponibilidade, tentativa, sucesso, contagem, ticks/rounds extremos, campos presentes/ausentes e erro sanitizado.
- Investigar `parse_ticks()` com propriedades reais de posição, movimento, vida, arma, economia, lado/equipe e estado de bomba; usar amostragem explícita e limitada, separada do canônico.
- Investigar `parse_grenades()` e preservar pontos/trajectory somente quando retornados pelo parser.
- Capturar header completo, inventário de jogadores, rounds e propriedades realmente observadas.
- Nunca ocultar exceções de stream opcional: elas entram na cobertura sem transformar a demo inteira em inválida.

### 3. Gate e mapeamento
- Criar o avaliador puro `RAW-EVIDENCE-01` e gates específicos de eventos, jogadores, rounds, economia, ticks, granadas e RAW→Canonical.
- Criar matriz explícita por campo com estados `MAPPED`, `DERIVED`, `UNAVAILABLE`, `UNSUPPORTED`, `UNMAPPED_BUT_AVAILABLE` ou `DROPPED_WITH_REASON`.
- Falhar o gate quando houver descarte silencioso, valor inventado ou ausência não catalogada.
- Manter o Gate 02-B estrito; não aceitar `round_players = 0` artificialmente e não gerar registros canônicos falsos.

### 4. Persistência separada e segura
- Adicionar tabelas de evidência bruta/relatório vinculadas ao upload/job e ao hash da demo, separadas das tabelas canônicas.
- Incluir `GRANT` explícito, RLS owner/admin para leitura e escrita apenas pelo serviço.
- Persistir manifest, coberturas, amostras e matriz antes da normalização/canonicalização.
- Tornar a gravação idempotente por demo + versão do contrato/parser, com substituição transacional do mesmo relatório em reprocessamento.
- Não persistir token, URL assinada, stack trace ou erro não sanitizado.

### 5. Integração no pipeline e console administrativo
- Fazer o worker retornar a evidência junto do contrato do APP, dentro do limite de payload existente.
- Validar o novo payload antes do normalizer e bloquear a entrada no Canonical Engine se o gate bruto reprovar.
- Expor leitura master-only do relatório persistido.
- Ampliar `/admin/demo-e2e` com as seções solicitadas: manifesto, event coverage, player fields, ticks, granadas e RAW→contract mapping.
- Mostrar `PASS / FAIL / BLOCKED` e evidência concreta por gate, sem dados sintéticos.

### 6. Testes e prova real
- Adicionar testes determinísticos no worker e APP para inventário, stream indisponível versus vazio, campos, manifest, players, ticks, granadas, economia, mapeamento, semântica de `null`, ausência de valores inventados, ausência de descarte silencioso, ordenação/serialização e parse parcial.
- Manter regressões dos eventos atuais e do caminho de 808 eventos.
- Rodar testes do worker e do APP, tipos, lint e build.
- Reexecutar `furia-vs-gamerlegion-m1-cache.dem` pelo pipeline real somente se o artefato privado ainda estiver disponível; produzir o relatório com contagens reais. Se o arquivo não estiver mais acessível, marcar apenas a prova real como `BLOCKED`, sem fabricar resultado.
- Atualizar documentação e roadmap com o estado factual de cada gate. Não iniciar a FASE 2.8.

## Critérios de aceite

- A saída bruta permanece separada do canônico e é consultável por demo.
- Toda capacidade testada possui resultado explícito: sucesso, vazio, indisponível ou falha sanitizada.
- Todo campo observado possui destino/status; nenhum campo é descartado silenciosamente.
- Ausência nunca vira zero/false/string vazia.
- Nenhum Steam ID, score, time ou lado é inferido.
- `round_players` só nasce de evidência real.
- O console administrativo exibe todas as coberturas solicitadas.
- O relatório final lista cada gate como `PASS`, `FAIL` ou `BLOCKED`, com números reais quando o E2E puder ser executado.

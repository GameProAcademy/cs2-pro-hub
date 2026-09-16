# FASE 2.7.2D.4-C — Final APP hardening, RAW recovery e release gate

## Objetivo
Concluir o hardening do APP antes da promoção coordenada do parser, sem tocar na branch/PR Railway, sem deploy, sem alterar secrets ou dados e sem executar/re-enfileirar a demo real.

## Implementação
- Separar explicitamente a **revisão semântica do parser** da **identidade exata do build**, mantendo compatibilidade coordenada com o lock atual e falha fechada em produção. Alinhar `/version`, resposta de parse, preflight e validação APP para detectar inconsistências.
- Tornar o artifact RAW `failed` recuperável pela mesma tentativa lógica somente quando toda a identidade coincidir. Reutilizar chunks `verified` idênticos, permitir regravação controlada dos demais, substituir manifest apenas antes de `ready` e manter `ready` imutável.
- Reforçar a decisão de auditoria no APP: o status informado pelo worker continuará apenas informativo; aprovação exigirá evidência internamente consistente, chunks verificados, cadeia contínua, digests de seção/root, manifest, identidade e HOT válidos.
- Congelar as matrizes HOT e RAW: contagens/overflow/partial determinísticos, seções não implementadas honestas, eventos não classificados preservados no RAW, ordem de seções, índices sem gaps, gzip determinístico e limites de 4 MiB alvo / 8 MiB máximo.
- Fechar o contrato durável de `/complete` para aceitar exclusivamente HOT + referência RAW válida, rejeitando RAW inline, campos forenses pesados, payload malformado e qualquer corpo acima de 8 MiB.
- Adicionar observabilidade sanitizada e limitada para lifecycle RAW, chunks, HOT e completion, sem URLs assinadas, tokens, credenciais, corpo RAW ou hashes completos desnecessários.
- Criar `docs/PHASE-2.7.2D.4-RELEASE-GATE.md` com os 16 gates, separando APP pronto, sync Railway, ambiente, deploy controlado e E2E real ainda não autorizado.
- Atualizar o runbook e o roadmap somente com resultados efetivamente comprovados.

## Testes e validação
- Cobrir revisão ausente/inválida/válida, modo development, divergências `/version` × parse × contrato APP e compatibilidade coordenada.
- Cobrir primeira escrita, recovery em cada ponto de falha, reutilização/conflito de chunks, colisões de identidade, manifest/root, READY imutável e falsa aprovação do worker.
- Cobrir matriz HOT, eventos não classificados, payload pequeno/no limite/acima do limite, RAW acidental e referência malformada.
- Executar testes focados TypeScript e Python, suíte disponível do parser, verificação de tipos, build automático, checks de segurança/logs e diff.

## Limites operacionais
- Não alterar, sincronizar ou fazer merge da branch/PR `integration/phase-2.7.2d4-railway-v8-sync`.
- Não fazer deploy Railway nem alterar variables, secrets ou configuração do serviço.
- Não processar, re-enfileirar, recriar tentativa ou alterar manualmente o job da demo Cache.
- Não alterar banco, migrations, RPCs, Canonical, métricas ou features fora do estritamente necessário para estes invariantes.

## Resultado esperado
Classificar o código como **READY FOR CONTROLLED RAILWAY DEPLOYMENT** somente se todos os gates locais passarem. O resultado continuará explicitamente **NOT READY FOR REAL E2E** até a promoção e validação Railway autorizadas.

# Fase 2.7.2G.6-R.4-C.2 — fechamento operacional pré-Attempt 9

## Objetivo
Fechar a governança de mappings, attestation, evidência Railway e CI sem executar o Attempt 9 nem alterar o runtime congelado.

## Implementação
1. **Autoridade Canonical** — comparar a saída real do adapter, o JSON e o schema do banco; criar sincronização determinística que preserve equivalentes, recuse divergências e mantenha todos os campos não autorizados com paridade/determinismo não executados.
2. **Semântica e reconciliação** — reforçar testes do adapter e gerar matriz machine-readable entre catálogo Python, WASM, mapping, tipos e persistência, preservando os 18 campos bloqueados.
3. **Attestation independente** — coletar a identidade do deployment diretamente da API Railway, validar os dois endpoints públicos, hashes dos blobs Git, OIDC e HMAC, sem fallback declarativo.
4. **Recorder e provenance** — validar toda a evidência antes da gravação privilegiada, manter provenance imutável e ancorar o horário no servidor.
5. **Release gate e CI** — exigir referências verificáveis por condição, corrigir os workflows no branch real e adicionar guardas contra fixtures, bypasses, Attempt 9/10+, cleanup e contaminação Canonical.
6. **Validação e relatório** — executar testes Python/TypeScript, checks de segurança e consultas somente leitura; registrar resultados reais e configurações externas ainda necessárias.

## Limites
- Não executar replay, DEM real, Attempt 9/10+, cópia de arquivo, cleanup, admissão Canonical, métricas ou features.
- Não alterar, reiniciar ou publicar o runtime Railway; não aceitar o staged patch.
- Não fabricar secrets, evidência externa, CI, provenance, paridade ou determinismo.

## Critério de conclusão
O inventário do banco coincide com código/JSON e os mecanismos operacionais ficam implementados e testados. O estado permanece bloqueado até que evidência externa real, CI remoto e a futura paridade same-DEM sejam comprovados.

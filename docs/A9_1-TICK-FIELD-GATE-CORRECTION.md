# A9.1 tick gate correction — synthetic-only implementation note

The failed run reached `parseTicks` and emitted `WASM_PARSE_FAILURE`. The surface manifest marks some project-catalogued fields as `runtimeRequestable=true` even when `upstreamSupported=false` (for example the synthetic `tick` alias). Passing those fields as a batch request is unsafe: a single unsupported field may fail the whole API call.

This branch changes runtime request selection to require all three:
- source API is `parseTicks`;
- `runtimeRequestable === true`;
- `upstreamSupported === true`.

A synthetic unit assertion verifies that unsupported aliases are excluded. This is a conservative request-contract fix, not evidence that the real DEM gate will pass. The exact low-level cause remains unproven because the failed run's public report stores only a sanitized error digest. Real-demo parsing, parity, determinism, browser artifact promotion, Attempt 9 and Canonical admission remain locked. This change does not trigger the workflow or touch Railway, the live database, secrets, or Lovable.

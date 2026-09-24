# H.3 — Controlled Real DEM Execution Readiness

STATUS: **IMPLEMENTED / QUALITY GATE PASS / REAL DEM EXECUTION NOT RUN**

## Objective

H.3 is the pre-execution gate between a documented real DEM candidate and one explicitly authorized controlled execution.

It does **not** execute the DEM, upload the DEM, persist parser output, or admit anything into Canonical.

## Scope

The H.3 gate freezes one exact execution envelope:

1. exact DEM filename;
2. exact byte size;
3. exact SHA-256;
4. parser version/revision/build identity;
5. contract version;
6. runtime artifact identity;
7. execution surface;
8. parser input strategy;
9. surface capacity evidence;
10. real runtime memory observation;
11. parser/runtime overhead measurement;
12. Python/WASM parity;
13. determinism;
14. tick authority;
15. player identity;
16. retention/deletion authorization;
17. fresh attestation;
18. explicit execution authorization;
19. Canonical lock remaining active.

Missing evidence is BLOCKED.

## Controlled execution surfaces

### Browser

The current browser parser remains constrained by:

- contiguous input;
- 128 MiB conservative ceiling;
- real parser disabled.

A DEM larger than 128 MiB is therefore blocked by H.3 for the browser surface.

### Railway controlled runtime

A Railway controlled run may be considered as an execution surface only after its capacity and runtime identity are independently verified. H.3 does not assume that Railway capacity is sufficient merely because the service has a configured memory limit.

The current authorized Cache DEM is:

- filename: furia-vs-gamerlegion-m1-cache.dem
- size: 473,748,061 bytes
- SHA-256: 0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d

The Cache DEM remains **NOT RUN**.

## Architecture

~~~
EXACT DEM IDENTITY
       |
       v
PARSER / CONTRACT / RUNTIME IDENTITY
       |
       v
REAL MEMORY + OVERHEAD + PARITY + DETERMINISM
       |
       v
TICK + PLAYER IDENTITY + RETENTION + ATTESTATION
       |
       v
EXPLICIT EXECUTION AUTHORIZATION
       |
       v
H.3 READINESS GATE
       |
       +---- BLOCKED --------------------+
       |                                 |
       | no execution                    |
       | no persistence                  |
       | no Canonical                    |
       |                                 |
       +---------------------------------+
       |
       +---- READY_FOR_CONTROLLED_EXECUTION
                    |
                    v
             CONTROLLED RUN ONLY
~~~

## Fail-closed contract

The source module is src/lib/client-parser/realDemExecutionReadiness.ts.

### BLOCKED

- canExecute=false
- canPersist=false
- canCanonicalize=false
- operation=METADATA_ONLY

### READY_FOR_CONTROLLED_EXECUTION

This state is only a pre-execution authorization signal. It does not grant:

- persistence;
- Canonical admission;
- production deployment;
- browser parser admission;
- automatic execution.

The caller must still perform the explicitly authorized controlled operation.

## Evidence interpretation

H.3 deliberately separates:

- **identity** — which exact DEM and runtime are being tested;
- **capability** — whether the selected surface can accept the input;
- **observation** — what the real parser/runtime actually consumed;
- **comparability** — whether Python/WASM outputs can be reconciled;
- **determinism** — whether repeated runs agree;
- **semantic authority** — whether ticks/player identity are authoritative;
- **retention** — whether the raw input lifecycle is authorized;
- **attestation** — whether the runtime evidence is fresh;
- **authorization** — whether this exact run has explicit operator approval.

A synthetic browser memory result cannot satisfy any of the real-parser observation fields by itself.

## Current H.3 disposition

The gate is implemented, unit-tested, and accepted by Quality Gate run #278 (Web tests / lint / build, Contract-sensitive parser tests, and CS2 parser tests all successful).

Current real evidence remains incomplete:

- real Cache parser run: NOT_RUN;
- exact parser/runtime memory observation for Cache: NOT_RUN;
- parser/WASM overhead: NOT_MEASURED;
- Python/WASM parity for Cache: NOT_RUN;
- deterministic repeated real-Dem run: NOT_RUN;
- authoritative tick evidence: NOT_RUN;
- complete player identity evidence: NOT_RUN;
- fresh runtime attestation for the execution: NOT_RUN;
- explicit execution authorization for the actual run: NOT_GRANTED.

Therefore the actual Cache execution remains **BLOCKED**.

## Retention rule

A controlled run must use:

exact input -> controlled execution -> compact evidence/result -> release raw references -> deletion

No raw DEM is permitted in:

- React state;
- JSON payloads;
- analytics;
- application database;
- long-term Storage;
- logs;
- Canonical.

## Exit criteria

H.3 is complete only when the evidence envelope for the selected DEM and execution surface is independently complete and the repository Quality Gates pass.

H.3 completion still does not mean the DEM was successfully parsed. The first real run is a separate controlled execution event and must be recorded independently.

## Next milestone

After H.3 readiness is independently complete, the next step is a **single controlled real DEM execution** against the exact authorized target, with no Canonical admission and no production rollout.

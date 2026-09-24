# H.3 — Controlled Real DEM Execution Readiness

STATUS: **IMPLEMENTED / PRE-EXECUTION GATE CORRECTED / REAL DEM EXECUTION NOT RUN**

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
10. fresh runtime preflight;
11. retention/deletion authorization;
12. fresh attestation;
13. explicit execution authorization;
14. Canonical lock remaining active.

Post-execution evidence:
- real parser memory;
- parser/runtime overhead;
- Python/WASM parity;
- determinism;
- tick authority;
- player identity.

Missing pre-execution evidence is BLOCKED.

Post-execution evidence is tracked separately because it can only be produced by the first controlled run.

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
RUNTIME PREFLIGHT + CAPACITY
       |
       v
RETENTION + ATTESTATION + AUTHORIZATION
       |
       v
CONTROLLED RUN
       |
       v
MEMORY + OVERHEAD + PARITY + DETERMINISM
       |
       v
TICK + PLAYER IDENTITY
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

The gate is implemented and its pre-execution semantics are corrected so the first real run is not logically deadlocked by evidence that can only be produced by that run. Repository Quality Gates are validating the correction.

Current pre-execution evidence remains incomplete:

- exact Cache identity: REGISTERED;
- parser/runtime identity: REGISTERED;
- Railway runtime preflight: OBSERVED;
- container memory envelope: OBSERVED (~4.0 GB cgroup limit);
- retention authorization: PENDING;
- fresh execution attestation: PENDING;
- explicit execution authorization: PENDING.

Post-execution evidence remains intentionally pending until the first controlled run:
- real parser child peak memory;
- parser/runtime overhead;
- Python/WASM parity;
- deterministic repeated run;
- authoritative tick evidence;
- complete player identity evidence.

Therefore the Cache execution remains **BLOCKED until the pre-execution envelope is explicitly completed**.

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

After the corrected pre-execution H.3 envelope is complete, the next step is a **single controlled real DEM execution** against the exact authorized target. That run produces the post-execution evidence envelope; Canonical remains locked.

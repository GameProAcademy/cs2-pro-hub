# H.3-E — Controlled Cache Execution Envelope

STATUS: **IMPLEMENTED / FAIL-CLOSED / PRE-EXECUTION**

## Purpose

Freeze one exact Cache DEM execution envelope before any real parser execution.

This phase does **not** execute the DEM, does not upload or copy DEM bytes, does not persist parser output, does not create Attempt 9, and does not admit anything into Canonical.

## Frozen target

- filename: `furia-vs-gamerlegion-m1-cache.dem`
- size: `473,748,061` bytes
- SHA-256: `0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d`
- parser: `demoparser2 0.42.0`
- parser revision: `git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76`
- contract: `1`
- execution surface: `RAILWAY_CONTROLLED`
- input strategy: `FILE_PATH`

The repository now freezes these values in `CONTROLLED_CACHE_EXECUTION_ENVELOPE` and exposes a dedicated evaluator that rejects any mismatch.

## Gate semantics

The generic H.3 gate remains responsible for:

- exact identity verification;
- parser/runtime identity;
- runtime preflight;
- input strategy;
- surface capacity;
- retention authorization;
- fresh attestation;
- explicit execution authorization;
- Canonical lock.

H.3-E adds a second fail-closed boundary: even if all generic evidence booleans are supplied as green, a different DEM, parser build, contract, execution surface, or input strategy cannot be presented as the authorized Cache envelope.

## Pre-execution evidence currently observed

- exact Cache identity: REGISTERED;
- parser/runtime identity: OBSERVED;
- Railway runtime preflight: OBSERVED;
- Railway cgroup memory limit: `3,999,997,952` bytes;
- parser package: `0.42.0`;
- contract: `1`;
- browser surface for this DEM: BLOCKED by the 128 MiB conservative ceiling.

## Still blocked

The following are required before the envelope may return READY:

- retention authorization;
- fresh execution attestation;
- explicit operator authorization for this exact controlled run;
- all required external runtime/provenance evidence.

The following are **post-execution** evidence and must not be used to deadlock the first controlled run:

- real parser child peak memory;
- parser/runtime overhead;
- Python/WASM parity;
- deterministic repeated execution;
- independent tick authority;
- complete player identity evidence.

## Hard locks

Until the pre-execution envelope is independently complete:

- no real DEM execution;
- no Attempt 9;
- no Attempt 10+;
- no final RAW evidence;
- no Canonical promotion;
- no cleanup;
- no Railway production mutation;
- no EnvironmentPatch;
- no secret exposure or rotation.

## Expected transition

`BLOCKED`

→ complete external pre-execution evidence

→ `READY_FOR_CONTROLLED_EXECUTION`

→ exactly one controlled Cache execution

→ capture post-execution evidence

→ reconcile RAW/forensic output

→ keep Canonical locked

The first controlled execution is a separate event from H.3-E and does not itself authorize Canonical.

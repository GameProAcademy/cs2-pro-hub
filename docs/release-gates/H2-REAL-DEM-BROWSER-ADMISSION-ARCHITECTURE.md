# H.2 — Real DEM Browser Admission Architecture & Fail-Closed Gate

STATUS: **H.2 PASS — ARCHITECTURE GATE IMPLEMENTED / REAL DEM EXECUTION BLOCKED**

## Objective

H.2 defines the authorization boundary between:

1. observing a real DEM as local file metadata;
2. hashing a file without parsing it;
3. materializing a contiguous parser input;
4. executing demoparser2/WASM;
5. persisting results;
6. admitting results into Canonical.

These operations must never be treated as equivalent.

## Current decision

**No real DEM is authorized to enter the browser parser.**

The H.1-M result is valid only for the synthetic browser-memory experiment. It is not an authorization signal for real DEM parsing.

The current browser parser remains:

- demoparser2 0.42.0;
- WASM/browser Worker;
- contiguous `Uint8Array` input;
- no verified streaming parser path;
- 128 MiB conservative ceiling;
- real parser disabled;
- Canonical locked.

## Architecture

```
USER FILE
   |
   v
METADATA PREFLIGHT
   |---- filename / .dem
   |---- size
   |---- capability availability
   |
   +----> CHUNKED HASH (optional diagnostic operation)
   |       8 MiB chunks / Worker
   |       no parser execution
   |
   v
H.2 ADMISSION GATE
   |
   +---- BLOCKED ------------------------------+
   |                                           |
   |   no real parser authorization            |
   |   no persistence authorization            |
   |   no Canonical authorization              |
   |                                           |
   +-------------------------------------------+
```

There is intentionally no H.2 path from local metadata directly to the parser.

## Why the gate blocks

The current parser adapter requires a contiguous input buffer. A real DEM above 128 MiB therefore cannot be admitted by the current parser path.

Even a real DEM at or below 128 MiB remains blocked because:

- H.1 memory evidence is synthetic;
- parser/WASM overhead has not been measured on a real DEM;
- Python/WASM parity is not closed for the authorized real DEM;
- determinism is not closed;
- fresh runtime attestation is not closed;
- retention authorization is not closed;
- Canonical admission remains locked.

A size check is therefore a **capability hint**, never an authorization.

## Required evidence before any controlled real-Dem execution

All of the following must be independently proven:

1. Exact DEM identity and SHA-256.
2. Exact file size.
3. Parser version/revision/build identity.
4. Contract version.
5. Browser/WASM artifact identity.
6. Parser input strategy and contiguous-buffer requirement.
7. Real runtime memory observation for the exact parser path, not merely synthetic fixtures.
8. Parser/WASM overhead observation.
9. Python/WASM parity for the authorized DEM.
10. Determinism across the required repeated runs.
11. Independent tick authority evidence.
12. Player identity resolution evidence.
13. Retention/deletion authorization and lifecycle.
14. Fresh runtime attestation where required by the release gate.
15. Canonical remains blocked until the complete evidence envelope is independently accepted.

Missing evidence means **BLOCKED**, not "probably safe".

## Large DEM policy

The following remain blocked without a verified streaming parser or new measured admission evidence:

- 128 MiB + 1 byte
- 300 MiB
- 400 MiB
- 500 MiB
- 473,748,061-byte Cache DEM
- the 382,007,151-byte Mirage DEM
- the 311,024,457-byte Dust2 DEM.

No limit increase is authorized by H.2.

## Retention policy

The browser architecture must follow:

`local file -> metadata/hash -> controlled processing -> compact result -> release references -> no persistence`

No raw DEM bytes may be:

- placed in React state;
- serialized into JSON;
- sent to analytics;
- written to application database;
- written to Storage;
- logged;
- admitted to Canonical.

The browser File object may remain referenced only for the explicitly controlled operation and must be released/terminated on completion, cancellation, timeout, or error.

## Fail-closed contract

The H.2 gate returns:

- `state=BLOCKED`;
- `canParse=false`;
- `canPersist=false`;
- `canCanonicalize=false`;
- `operation=METADATA_ONLY`;
- explicit blocker codes.

No blocker may be inferred away from file size.

## H.1 relationship

H.1-M established successful synthetic materialization observations at 16/32/64/96/128 MiB in the tested Chrome 153 Preview runtime.

The H.1 result remains useful only as diagnostic evidence for the synthetic materialization mechanism; it does not authorize real DEM parsing.

## Exit criteria

H.2 is complete only when the architecture and fail-closed authorization contract are implemented, tested, and accepted by the repository Quality Gates.

Quality Gate run #267 completed with Web tests / lint / build, Contract-sensitive parser tests, and CS2 parser tests all successful.

H.2 does **not** mean real DEM execution is complete.

The next gate is a separate **Controlled Real DEM Execution Readiness** milestone. It must not be started by simply enabling the existing real-parser flag.

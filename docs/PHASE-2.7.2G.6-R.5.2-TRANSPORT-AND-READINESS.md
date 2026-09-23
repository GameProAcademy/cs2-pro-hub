# R5.2–R5.4 — Real DEM transport and forensic readiness

## Isolation and identity

The authorized DEM is staged outside `uploads`, `demo_jobs`, queues, final RAW evidence and Canonical. Its release, filename, expected size, SHA-256, bucket and object path are immutable. Only transport and verification evidence may change.

## Transport

The master-admin page uses Storage TUS uploads with 6 MiB chunks, bounded retries, resumable fingerprints, progress, speed, remaining bytes and safe cancellation. The server supplies the fixed destination; the browser cannot choose another bucket or path. Existing objects are never overwritten automatically.

Browser validation rejects the wrong name or size and hashes 8 MiB slices incrementally. This local digest is an early safety check, not final authority.

## Verification

Final verification reads the private stored object through a short-lived URL and consumes its response stream incrementally. It does not call `storage.download()`, allocate a whole-file buffer, use one-shot `crypto.subtle.digest`, or treat `Content-Length` as proof. Read byte count and SHA-256 must match the authorized identity before `READY_FOR_EXECUTION`.

## Gates

`READY_FOR_EXECUTION` means only that the physical bytes are staged and verified. The read-only forensic execution gate remains blocked until real HMAC, OIDC and current-runtime provenance evidence exists. The separate Attempt 9 authorization function is intentionally unreachable and always raises `R5_ATTEMPT_9_NOT_AUTHORIZED` in this phase.

R5.3 and R5.4 contracts preserve `NOT_RUN`, `NOT_VERIFIED`, `BLOCKED` and `UNAVAILABLE` for Python, WASM, parity, determinism, tick authority, RAW evidence, nonce and provenance until real execution evidence exists. Historical Attempt 8 RAW evidence is retained as historical evidence and is not current-runtime proof.

## Retention

Staging expires after 24 hours. Expiration makes the gate fail closed and makes the object eligible for a separately authorized cleanup phase. This implementation does not delete the object or execute cleanup.

## Current verdict

The transport, storage boundary, bounded-memory verification and access controls are implemented. No real DEM bytes were supplied in this change, so transport and identity verification remain blocked, and no parser, Attempt 9, Canonical write, Railway change or destructive cleanup ran.

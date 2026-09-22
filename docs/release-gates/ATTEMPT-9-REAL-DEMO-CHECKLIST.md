# Attempt 9 — Real DEM checklist

All evidence must refer to one explicitly authorized DEM and remain independently auditable.

- [ ] DEM authorized
- [ ] SHA-256 recorded
- [ ] File size recorded
- [ ] Parser version recorded
- [ ] Parser revision recorded
- [ ] Build revision recorded
- [ ] Contract version recorded
- [ ] Python parse completed
- [ ] WASM parse completed
- [ ] Python/WASM parity verified
- [ ] Determinism verified with two runs per runtime
- [ ] Independent tick authority verified
- [ ] Forensic audit complete
- [ ] Player identity resolution verified
- [ ] Mapping release bound and unchanged
- [ ] Runtime attestation recorded and fresh
- [ ] Retention authorization verified
- [ ] Cleanup status verified without executing cleanup
- [ ] Release gate returns `READY_TO_EXECUTE_ATTEMPT_9`
- [ ] Attempt 9 authorization independently reviewed

## Stop conditions

Any missing, stale, mismatched, inferred, fixture-only or partial evidence keeps the gate `BLOCKED`. A staged Railway change is not deployed evidence. No evidence may authorize Attempt 10+.

**DO NOT EXECUTE ATTEMPT 9 until every box is proven.**
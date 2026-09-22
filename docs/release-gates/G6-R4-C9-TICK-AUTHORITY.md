# G.6-R.4-C.9 — Tick authority

## Protocol

`TickDomainAuthority` records authority type/source, DEM SHA-256, parser revision, tickrate, minimum/maximum tick, explicit intervals, coverage digest, authority digest, creation time and status.

Statuses are `UNAVAILABLE`, `OBSERVED_ONLY`, `PROVISIONAL` and `VERIFIED`. Only independently sourced `VERIFIED` evidence can satisfy `FULL_TICK_DOMAIN_AUTHORITY`.

- `playback_ticks` is retained only as an observation.
- Observed parser ticks do not prove the complete domain.
- `TEST_FIXTURE_ONLY` is always `PROVISIONAL` and cannot pass the production gate.
- Missing, unexpected, duplicate, overlapping, out-of-order or invalid ticks block completion.
- Coverage below exactly 1.0 blocks completion.

## Decision

Real authority remains `UNAVAILABLE / NOT_RUN`; no tick evidence was promoted.
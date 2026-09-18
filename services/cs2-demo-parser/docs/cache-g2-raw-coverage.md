# Cache G.2 — RAW coverage closure

This records a read-only projection of the immutable Cache artifact. It does not change, approve, or supersede that artifact.

## Artifact evidence

- Job: `a31f5c25-b0d8-41ac-8225-27814cd1732a`
- Upload: `b7d41ad7-b143-4a3a-ab80-ebfee2d2c043`
- Attempt: `7`
- Artifact: `3a1e5225-f0f2-427a-97b8-c21dac936e7d`
- Demo SHA-256: `0caa7c9744deec106095895d2dacd19cbfdae689f99e29e29b0dd4d446b4ec8ae3d`
- Root digest: `ccbcafe55e7eca0270d6fb85cdd996f0163b5d209367819fa11c71efd06328d2`
- Audit evidence digest: `6349c2cb79b14a1f8d9fa69ea5dd940cbc3ceb6d39c15bb60f8e3cdc7f4c64`
- Stored parser revision: `git:e3e98bed16a71b23b05f8b2742b1d92b6198efd4`
- Contract: `1`
- Physical inventory: 24 verified chunks, 373,754 rows, 2,799,488 compressed bytes
- Immutable status: artifact `READY`, RAW `READY`, audit `BLOCKED`

The manifest reports 365 mappings: 11 `MAPPED`, 176 `RAW_ONLY_INTENTIONAL`, and 178 `UNMAPPED_BUT_AVAILABLE`. Its failing gates are exactly `RAW-EVIDENCE-01`, `RAW→CANONICAL`, and `ROUND-COVERAGE`.

## Classification of the 178 legacy unmapped fields

The exact field corpus is stored in `tests/fixtures/cache_raw_audit_g2.json` as executable evidence. Under the current contract:

- `MAPPED` (4): `game_state.name`, `game_state.steamid`, `game_state.tick`, `player_death.attackerblind`.
- `RAW_ONLY_INTENTIONAL` (174): every other field in that fixture. Each is accepted only by a named family/field allow-list and must carry a non-empty technical reason.
- `UNMAPPED_BUT_AVAILABLE` (0): no field from the preserved 178-field corpus remains unknown under current code.

No wildcard or generic fallback was added. A future unknown header, player, game-state, grenade, round, or event field remains `UNMAPPED_BUT_AVAILABLE` and blocks admission.

## Gate evidence

- `RAW-EVIDENCE-01`: legacy artifact remains `FAIL`; current local projection is eligible for `PASS` because all 178 observed fields now have explicit destinations or intentional RAW-only reasons.
- `RAW→CANONICAL`: legacy artifact remains `FAIL`; current local projection is eligible for `PASS` because no observed field is unclassified and required semantic destinations remain explicit.
- `ROUND-COVERAGE`: legacy artifact remains `FAIL`; read-only reconstruction from verified tick chunks found 25 observed `total_rounds_played` states (0–24). Current code derives round boundaries from preserved tick evidence and rejects inconsistent timing slopes.

The forensic chunk reports 68 event capabilities: 44 parsed successfully, 23 not present in this demo, and 1 available but empty. `event_capability_coverage` is `COMPLETE`; usercmd remains truthfully `UNAVAILABLE`.

## Operational status

Local contract coverage is closed. The immutable artifact and audit result were not modified. No Cache Run 1, Run 2, idempotency run, deployment, database mutation, secret change, or Phase 2.8 work was performed. Controlled parser synchronization and a newly authorized official lifecycle run remain required before any real E2E PASS can be declared.
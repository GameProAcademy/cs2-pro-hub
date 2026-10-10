# A9.1 canonical parity contract — version 1

Laboratory contract for comparing the Python reference (`demoparser2` wheel) with the
WASM build of the same parser. It grants **no** Canonical, Attempt 9 or production
authority. The machine-readable source of truth is
`scripts/a91/canonical/contract.json`; this page explains it.

| Piece                                                            | File                                  |
| ---------------------------------------------------------------- | ------------------------------------- |
| Contract data (rules, registry, version)                         | `scripts/a91/canonical/contract.json` |
| JavaScript implementation                                        | `scripts/a91/canonical_schema.mjs`    |
| Python implementation                                            | `scripts/a91/canonical_schema.py`     |
| Shared vectors (both runtimes must reproduce them byte for byte) | `scripts/a91/canonical/vectors.json`  |
| Field-level comparison                                           | `scripts/a91/field_compare.mjs`       |
| Cross-runtime check with intentional divergences                 | `scripts/a91/cross_runtime.check.mjs` |

## Why it exists

Run #24 (`38028042333`, commit `3941fae`) failed 10 of 14 comparable domains. Reading the
code and re-running both parsers on the public R11 fixture showed that most of that was the
harness, not the parser:

1. **Asymmetric envelopes.** Commit `3941fae` added five call-metadata keys to the Python
   event envelope only. Seven domains hashed that envelope, so they could not pass even with
   identical rows.
2. **64-bit identifiers.** `steamid` is `uint64` in Python and a decimal string in WASM, and
   the Python canonicalizer rounded integers above 2^53 to a double. Tick and grenade tables
   differed by construction, and the reference lost Steam ID precision.
3. **Digest-only comparison.** A domain was one SHA-256 over a sample; a failure said nothing
   about which field, row or kind of difference.

## Value rules

| Rule       | Statement                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 null    | `null`, `undefined`, pandas `NA`/`NaT` and non-finite floats are JSON `null`. Null is never `0`, `false`, `""` or `[]`.                                                                                                                          |
| R2 u64     | Fields in `u64DecimalFields` (`steamid`, `*_steamid`) are exact decimal strings. A float or JS number there is `U64_PRECISION_LOST`; non-decimal text is `U64_INVALID`; an unlisted 64-bit column is `UNREGISTERED_U64_FIELD`. All fail closed.  |
| R3 integer | Integral finite numbers up to 2^53−1 are class `integer` whatever the carrier (`int32`, `float32`, `float64`). pandas widens nullable integer columns to float; the value, not the carrier, is compared. Larger integers outside R2 fail closed. |
| R4 float   | Other finite numbers use the ECMAScript number-to-string algorithm (RFC 8785 §3.2.2.3). `-0` is `0`.                                                                                                                                             |
| R5 string  | Exact comparison. No trimming, case folding or Unicode normalization. Lone surrogates fail closed.                                                                                                                                               |
| R6 object  | Keys sorted by UTF-16 code units (RFC 8785 §3.2.3). Key presence is significant.                                                                                                                                                                 |
| R7 array   | Order is significant. `[]` is not null.                                                                                                                                                                                                          |

## Table rules

| Rule                       | Statement                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8 rectangular             | The field set of a table is the union of row keys. A key missing from one row equals an explicit null in that row, because the Python reference returns DataFrames and cannot tell them apart. A field missing from the **whole** table is `FIELD_PRESENCE` and fails.    |
| R9 row order               | Parser emission order is significant. Equal multisets in another order are `ROW_ORDER` and fail.                                                                                                                                                                          |
| R10 event discriminator    | The WASM wrapper adds `event_name` to every event row. It must equal the requested event in every row, then it is call metadata.                                                                                                                                          |
| R11 metadata               | Requested/returned field lists, timings, memory and run ids are call evidence (`apiCalls`). They are never in semantic evidence or digests. Both producers build semantic evidence through one shared builder each (`build_semantic_evidence` / `buildSemanticEvidence`). |
| R12 lossy reference fields | A property the Python reference cannot deliver exactly is not requested from either runtime, and the exclusion is reported. Today: `player_steamid` as an event player property (see below).                                                                              |

### R12 evidence

On the public fixture, `demoparser2==0.42.0` returns `assister_player_steamid`
(`player_death`, 18 of 73 rows non-null) and `attacker_player_steamid` (`player_hurt`, 260 of 264) as `float64`: a nullable `uint64` column goes through polars → pandas and is rounded
inside the wheel. The same identity is always present, exact, in the default
`<prefix>_steamid` text field, which stays requested and compared.

## Table summary

Each table is reduced, in one streaming pass and bounded memory, to:

- `rowCount`, sorted `fields`;
- `tableDigest` (rows in emission order) and `multisetDigest` (order-independent);
- per field: a column digest and a count per value class
  (`null`, `bool`, `integer`, `float`, `string`, `u64`, `array`, `object`);
- for `grenades`, a count per `grenade_type` (engine class names, not player data).

Private diagnostics (block digests per 4,096 rows and the first 256 canonical rows) stay in
the private runtime envelope and are used only to localize a divergence.

## Comparison output

Domains keep their SHA-256 equality check (`compareDomains`), now over symmetric evidence.
`field_diagnostics` adds, per table and field: presence in each runtime, class counts,
divergence class, the first divergent row range and, inside the sample, the first divergent
row index with the Python and WASM value classes. No values are emitted.

| Divergence class | Meaning                                |
| ---------------- | -------------------------------------- |
| `FIELD_PRESENCE` | field exists in one runtime only       |
| `ROW_COUNT`      | different number of rows               |
| `NULLABILITY`    | different number of nulls in the field |
| `TYPE`           | same nulls, different value classes    |
| `VALUE`          | same classes, different values         |
| `ROW_ORDER`      | same rows, different order             |

Statuses stay `PASS`, `FAIL`, `NOT_COMPARABLE`, `NOT_RUN`, `BLOCKED`. A table that is empty
in both runtimes is equal but proves nothing; the report counts those
(`empty_in_both_table_count`).

## Versioning

`canonicalContractVersion` is carried by every summary and by `artifact.canonicalContract`
(with the SHA-256 of `contract.json`). Summaries of different versions are `BLOCKED`, never
compared. Any rule or registry change requires a new version, new vectors and both
implementations in the same change. Digests from before this contract are not comparable
with digests produced under it.

## Known open divergence (not resolved by this contract)

Measured on the public fixture (`test_demo.dem`, 60,601,900 bytes, SHA-256 `84a1a419…2cb2`)
with both real parsers: 12 of 14 comparable domains pass, 503 of 511 fields equal. The
`grenades` table differs in row count, and only in three non-grenade classes:

| `grenade_type`                                 | Python rows | WASM rows |
| ---------------------------------------------- | ----------- | --------- |
| `CC4`                                          | 3,776       | 6,639     |
| `CKnife`                                       | 3,776       | 6,953     |
| `CWeaponGlock`                                 | 5,176       | 8,347     |
| every grenade and projectile class (9 classes) | equal       | equal     |

Cause in the pinned upstream (`d376770`): `projectiles` is a set of entity ids filled when an
entity whose class name contains `Projectile`, `Grenade` or `Flash` is created
(`second_pass/entities.rs`, `create_new_entity` / `check_entity_type`) and emptied only on
`Delete`. When the engine reuses an id for another class without a delete, the stale id keeps
emitting rows for the new entity. How many leak depends on where parsing starts, so the
multithreaded Python build and the single-threaded WASM build disagree. This contract does
not hide that: the domain stays `FAIL` until a separate, versioned contract decision is taken.

## Contract v2 — grenade domain row filter (rule R13)

Status: **proposal, needs the owner's decision.** It changes which rows count
as the grenade domain.

**Fact.** The pinned parser treats an entity as a projectile when its class
name contains `Projectile`, `Grenade` or `Flash` and does not contain `Player`
(`LaihoE/demoparser@d3767705`, `src/parser/src/second_pass/entities.rs:388`).
It keeps the entity id in a set and emits one row per tick for every id in the
set. When a later entity of another class reuses the id, rows of that class are
emitted too.

**Measured on the public fixture.** Python 517,048 rows, WASM 526,259. The
difference is entirely in `CC4`, `CKnife` and `CWeaponGlock`. Keeping only rows
that satisfy the parser's own predicate gives 504,320 rows in both runtimes,
equal in sequence and in every field.

**Rule.** The `grenades` table keeps only rows whose `grenade_type` satisfies
that predicate. Excluded rows are counted by class in each runtime and both
counts are published in `contract_exclusions` of the parity report. A null or
non-string `grenade_type` fails closed (`DOMAIN_FILTER_FIELD_INVALID`).

**What it does not do.** It does not hide a divergence among grenade rows: an
extra row of a real grenade class, or one changed value, still fails
(`cross_runtime.check.mjs`). It does not make excluded counts a parity
dimension; they are reported, and they differ (12,728 vs 21,939 on the fixture).

**Not proven.** That the real A9.1 demo behaves like the public fixture.

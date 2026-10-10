# A9.1 — WASM memory remediation (P1)

Status: laboratory harness only. Nothing here changes production, the browser
artifact under `public/client-parser/`, or the Railway worker. It does not
authorize A9.1, the Canonical Engine or any phase promotion.

## 1. What failed (facts from run #25, commit `c433fcc`, artifact 38031021139)

| Evidence           | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| Reason / stage     | `WASM_RUNTIME_TRAP` at `parse_grenades`                   |
| Trap detail        | `RuntimeError`, message digest = sha256("unreachable")    |
| WASM linear memory | 2,577,793,024 → 4,294,967,296 bytes (65,536 pages)        |
| Demo               | 473,748,061 bytes; 4,550,843 grenade rows in Python (#24) |

4,294,967,296 bytes is the hard ceiling of a wasm32 linear memory. Rust aborts
on allocation failure, and on `wasm32-unknown-unknown` an abort is the
`unreachable` instruction.

## 2. Root cause (reproduced, not inferred)

The pinned upstream wrapper (`src/wasm/src/lib.rs`, commit `d3767705`) builds
the grenade table twice inside linear memory:

1. columns (`OutputSerdeHelperStruct`) produced by the parser;
2. `soa_to_aos`, which turns them into `Vec<HashMap<String, Option<Variant>>>`
   — one hash map, with freshly allocated key strings, per row.

Measured on the public fixture (526,259 rows): 235 bytes/row after the parse,
+745 bytes/row for `soa_to_aos`. At 4,550,843 rows that second step alone
needs about 3.4 GiB on top of the input copy and the columns.

Reproduction without any demo (`a91SyntheticGrenadeTable`, same eight columns
and value types, 4,550,843 rows, 473,748,061 bytes of input ballast):

| Path                                  | Result                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| row-major (upstream)                  | `RuntimeError: unreachable`, 65,536 pages, last stage `parsed_columns_built` (i.e. inside `soa_to_aos`) |
| row-major, fresh instance, no ballast | same trap — a clean instance alone does not rescue row-major                                            |
| column-major                          | completes, 1,486,946,304 bytes (22,689 pages)                                                           |

Synthetic rows prove the memory model. They prove nothing about the content of
the real demo, and the real run remains the only acceptance evidence.

## 3. What changed

| Change                                                                             | Why                                                                                                                | Semantics                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `parseGrenadesColumns` export (`scripts/a91/wasm_patches.py`)                      | serializes the columns directly, skipping `soa_to_aos`                                                             | same `ParserInputs`, same columns, `parse_projectiles: true` unchanged |
| one WASM instance per API call, module compiled once                               | linear memory can only grow; in run #25 the shared instance entered `parseGrenades` already at 2,577,793,024 bytes | none                                                                   |
| streaming canonical summaries (`summarizeEventRows`, `summarizeColumnTable`)       | removes the full normalized JS copy of every table                                                                 | digest identical to the previous pipeline (see §4)                     |
| explicit budget `WASM_MEMORY_BUDGET_BYTES` = 3 GiB → `WASM_MEMORY_BUDGET_EXCEEDED` | a classified failure instead of an opaque trap at the ceiling                                                      | fail-closed                                                            |
| `a91MemoryProbe` export, sanitized into the failure report                         | names the internal stage and memory at failure (fixed labels and integers only)                                    | none                                                                   |
| pre-grow of linear memory (commit `dcebca1`) removed                               | it reserved memory without reducing need; no evidence it ever helped                                               | none                                                                   |

Projectile extraction is **not** disabled, no domain is removed, and the
comparator is unchanged.

## 4. Equivalence evidence (public fixture, 60,601,900 bytes)

- `normalizedResultDigest` of the WASM run is byte-identical before and after
  the change: `7c33eab9…5637e`.
- Row-major and column-major exports of the same artifact give the same
  canonical grenade table digest (`a92f92da…18d0`, 526,259 rows).
- WASM linear memory for `parseGrenades`: 578,813,952 → 193,003,520 bytes.
- `scripts/a91/wasm_memory.check.mjs` proves the streaming summaries equal the
  previous copy-based pipeline, including null/absent cells and u64 identifiers.

## 5. Automatic public-fixture gate

`.github/workflows/a91-public-fixture-gate.yml` builds the same pinned WASM
(`rebuild_wasm_large_demo.build_wasm_artifact`) and runs 2× Python + 2× WASM on
the public upstream test demo. It checks determinism, field-level comparison,
the row/column equivalence, memory and time limits, and the synthetic 4 GiB
reproduction. Cross-runtime divergence is a strict ratchet
(`public_fixture_expectations.json`): a new divergence fails the job, and so
does a divergence that disappears without the expectation being updated.

It cannot authorize anything: its artifacts carry `test_fixture_only: true`,
`executionKind: PUBLIC_FIXTURE_FULL_FILE` and the public demo's hash, and
`decide()` rejects each of the three independently.

## 6. Not proven

- That the real 474 MB demo completes `parseGrenades` under the budget. The
  estimate (≈1.4–1.5 GiB) comes from the synthetic model; only a manual run of
  the real gate can confirm it.
- That parity passes on the real demo. On the public fixture the `grenades`
  domain still diverges (517,048 vs 526,259 rows, only in non-grenade entity
  classes). That is a contract question and is handled separately.

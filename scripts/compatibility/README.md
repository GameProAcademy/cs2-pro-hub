# Compatibility harness (PM6)

Read-only tools for checking how CS2 demo families behave with the parser. They run in a
disposable sandbox only: never in production, never against the production database, and
never with network upload of a demo.

| Script                | What it does                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `verify_corpus.py`    | Checks local files against `docs/reference/compatibility/corpus_manifest.json` (SHA-256 + size)         |
| `capability_probe.py` | Header fields, registered events, row counts per event, tick props on death ticks                       |
| `lifecycle_probe.py`  | Usercmd content (non-empty lists only), round lifecycle ticks, player inventory size                    |
| `pipeline_probe.py`   | Runs the worker `parse_demo_file` → `prepare_evidence` with the production identity and keeps a summary |
| `privacy.py`          | Guard that refuses any output carrying a SteamID64 or a value for an identity key                       |

Usage (with a venv that has the pinned `demoparser2` and the worker requirements):

```bash
python3 scripts/compatibility/verify_corpus.py docs/reference/compatibility/corpus_manifest.json demo.dem
python3 -I scripts/compatibility/capability_probe.py demo.dem out/cap.json
python3 -I scripts/compatibility/lifecycle_probe.py demo.dem out/life.json
python3 -I scripts/compatibility/pipeline_probe.py services/cs2-demo-parser demo.dem out/pipe.json
```

## Adding a fixture

1. Have the owner's authorization, or confirm the demo is public with terms that allow it. Record which.
2. Compute SHA-256 and size first. Keep the binary out of git.
3. Run the three probes in the sandbox. The privacy guard must pass.
4. Add the entry to `corpus_manifest.json` with the origin and its basis:
   - `owner declaration`, or
   - observable signals → `PROBABLE`/`UNKNOWN`.

   Never classify by file name or hostname alone.

5. Record the result and blockers in `docs/pm6/PM6_BASELINE_RESEARCH_MATRIX.md`.

## Supporting a new demo generation

1. Reproduce the failure locally with the exact parser version deployed (`/version`).
2. Read the upstream changelog. Prove the fix is present in the candidate version, or write a test.
3. Run all fixtures with the current and the candidate version and diff rounds, events, players, fields and gates.
   Every difference needs an explanation.
4. Unknown fields block by design: review them through `docs/PARSER_FIELD_GOVERNANCE.md`, never by weakening a gate.
5. A worker change is a controlled release (`docs/H3E_RELEASE_IDENTITY_TRACEABILITY.md`). Merge it only right
   before deploying, because the H.3-E gate compares the worker tree with the deployed build.

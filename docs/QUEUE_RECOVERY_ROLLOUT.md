# Queue recovery and canonical persistence: rollout

Two migrations, one bridge change, one worker change. They are **not** one
atomic release: merging to `main` does not apply a migration, does not publish
the app and does not deploy the worker. This file states the order that keeps
every intermediate state safe, and what was verified where.

## Pieces

| Piece                                                            | Where it runs                                   | Reaches production by           |
| ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| `20261011120000_demo_parse_recovery_protocol.sql`                | managed database                                | applying the SQL (not by merge) |
| `20261011130000_canonical_participant_confidence_null.sql`       | managed database                                | applying the SQL (not by merge) |
| bridge: dispatch-scoped execution identity, abandon, digest sort | app (`durableBridge.server.ts`, `rawArtifact*`) | publishing the app              |
| worker: dispatch-scoped identity, portable digests, isolation    | `services/cs2-demo-parser`                      | deploying the worker            |

## Compatibility matrix

| Schema | Bridge | Worker | Result                                                                                                                                                                    |
| ------ | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| old    | old    | old    | today                                                                                                                                                                     |
| new    | old    | old    | **safe.** No signature, grant or message format changes. A dispatch is leased at most 3 times, then ends `JOB_STALE` instead of looping                                   |
| new    | new    | old    | fail-closed. Dispatch 0 works as before. On a retry dispatch the old worker sends the dispatch-0 identity, reconciliation answers `UNKNOWN`, bounded by the 3-lease limit |
| new    | new    | new    | the protocol in `QUEUE_RECOVERY_PROTOCOL.md`                                                                                                                              |
| old    | new    | any    | **not allowed.** The bridge would call `abandon_demo_parse_dispatch`, which does not exist: reconciliation errors, job loops as today                                     |

So the schema goes first, and the bridge never goes before it. The canonical
migration is independent of all the others.

## Order

1. Apply `20261011120000`, then `20261011130000`, in one session, on the
   managed database. Verify function bodies, grants, the new column and table.
2. Publish the app (bridge). Until then production keeps the old bridge on the
   new schema, which is the safe second row above.
3. Deploy the worker from the same commit as the published bridge.

Step 3 has preconditions outside this change: the published app accepts one
pinned worker revision (`DEMO_PARSER_EXPECTED_REVISION`, default
`git:5703b1d…`), and in production its event bridge refuses durable execution
events until deployed-source parity is proven
(`H3E91_DEPLOYED_SOURCE_PARITY_UNVERIFIED`). A worker from `main` deployed
before both are resolved parses nothing.

## What the migrations replace

Compared on 2026-10-11, `md5(prosrc)` and ACL of the four functions in the
managed database equal a database built from the repository migrations, so the
migrations replace exactly what is running.

| Function                        | before (managed = repository)      | after                              |
| ------------------------------- | ---------------------------------- | ---------------------------------- |
| `claim_demo_parse_message`      | `a7bfd9a3a13cf19085f2e0bae81877db` | `826ba0f6941cdc969daa1cb0f575bcab` |
| `dispatch_demo_parse_message`   | `3e1358bc577e388a7caefdd456c4ec47` | `6319f1316bbeeba77d02c0925c341556` |
| `recover_stale_demo_jobs`       | `d42c14c59b5e4495b8adb7b380473275` | `2e62cb7ffc9477b685357157808be974` |
| `persist_canonical_observation` | `e09195ad541a02f3ce13aa4fdd2e89ef` | `d313725db0bb3e94ba72b483344b9d4b` |
| `abandon_demo_parse_dispatch`   | —                                  | `a2b51d36a90b4aef8c3f5a267792274a` |
| `close_demo_parse_dispatch`     | —                                  | `199986789ff0a884429c17d649525387` |

New: column `demo_jobs.delivery_count`, table `demo_job_dispatch_closures`
(row level security on, no policies, `SELECT` for `service_role` only).
`close_demo_parse_dispatch` is executable by its owner only.

The managed database runs PostgreSQL 17.6 with pgmq 1.5.1. The CI stack that
runs the probes reports the same two versions. The new functions use only
pgmq calls the replaced ones already used (`read`, `archive`, `send`).

Not explained by this change: the managed database records 149 migrations and
the repository has 152 before these two. Four repository versions are not
recorded there (`20260922073800`, `20260926070000`, `20261005090000`,
`20261006120000`) and two recorded versions are not in the repository
(`20260923011134`, `20260923011214`). The functions touched here were compared
directly for that reason.

## Rollback

`docs/rollback/20261011_queue_recovery_and_canonical_rollback.sql` restores the
four function bodies and removes the two new functions and the column. Checked
on a disposable database: forward, then rollback, gives back the four "before"
hashes above. It keeps the closure rows.

Roll back in reverse order: worker, then bridge, then schema. The schema alone
can be rolled back at any time while the old bridge is running.

There is no managed snapshot taken by this change: the tools available here
cannot create one. The rollback file plus the fact that no table data is
rewritten (one column added with a default, one empty table created) is the
recovery path.

# CI gates: what each check covers, and what protects `main`

Read on 2026-10-11 at `main` = `258b6145`.

## The one check that is always present

`Main required gates` (job `main-required-gates` in
`.github/workflows/quality-gates.yml`) runs on every push to `main` and every
pull request to `main`, with `always()`. It fails unless each of its `needs`
ended `success`; `skipped` and `cancelled` count as failures
(`scripts/ci/require_main_gates.py`, self-tested in the same job).

Its `needs`, and nothing else, are what it covers:

| Job                               | Covers                                                    |
| --------------------------------- | --------------------------------------------------------- |
| `Web tests / lint / build`        | app unit tests, lint, build, sealed browser bundle        |
| `Contract-sensitive parser tests` | parser contract tests on the worker tree                  |
| `F553 R11.2 EXECUTION`            | worker image build, image allowlist, R11 matrix, recovery |

## Checks outside the aggregator

These are filtered by path. When the paths are not touched the check does not
exist on the commit, so it cannot be a required check without blocking every
other pull request.

| Workflow / job                                                            | Runs on                                                              | Role                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Queue semantics on a disposable database`                                | pull requests touching the queue, bridge, worker or migrations paths | required by convention: do not merge such a pull request unless it is green          |
| `Queue recovery end to end (real worker, real bridge, real storage)`      | same                                                                 | same                                                                                 |
| `Python/WASM harness on public fixture` (`a91-public-fixture-gate.yml`)   | pull requests and pushes touching the parity paths                   | same, for parity changes                                                             |
| `a91-real-dem-gate.yml`, `parser-runtime-attestation.yml`, `h3-*`, `r5-*` | `workflow_dispatch` only                                             | manual evidence; never a merge gate                                                  |
| `F553 R11.2 POST-COMPLETION ATTESTATION`                                  | after each `Quality Gates` run on `main`                             | attests the finished run; it fails when the run it attests was cancelled (see below) |

The two queue jobs take about 15 minutes and need the Supabase local stack,
which is why they are not folded into the aggregator. If they are to be
enforced by GitHub rather than by convention, the supported way is a ruleset
with "Require workflows to pass" limited by path, or a thin always-running
job that reports `success` when the paths are untouched. Neither exists yet.

Post-completion attestation and merges in quick succession: `Quality Gates`
cancels a superseded run on the same ref. Three merges within a minute on
2026-10-11 (`c713e927`, `3027d33e`, `258b6145`) left two cancelled runs, and
the attestation of each failed (runs `38166644091`, `38166702539`). The
attestation of the surviving run for `258b6145` passed (`38167551674`). Those
two red marks on `258b6145` are attestations of cancelled runs, not failures
of that commit.

## Protection of `main`: not active

`GET /repos/GameProAcademy/cs2-pro-hub/branches/main/protection` answers 404
(not protected) and the repository has no rulesets. Writing either one from
the automation used here is refused with 403 by its proxy, before GitHub is
asked. So nothing prevents a direct push, a force push or deleting `main`
today.

Constraint that decides the rule set: Lovable pushes its commits directly to
`main` through its GitHub App. A rule that requires a pull request or a status
check applies to that push too, and no check can exist on a commit before it
is pushed. Such a rule stops the Lovable sync unless the Lovable app is on the
bypass list.

Steps for the owner (Settings → Rules → Rulesets → New branch ruleset):

1. Name `main`; enforcement **Active**; target **Include default branch**.
2. Enable **Restrict deletions** and **Block force pushes**. These two do not
   affect Lovable and can be enabled without any bypass.
3. Enable **Require a pull request before merging** with 0 approvals, and
   under allowed merge methods leave only **Merge**.
4. Enable **Require status checks to pass**, add `Main required gates`, and
   pick **GitHub Actions** as its expected source so no other integration can
   report it.
5. Bypass list: add the Lovable GitHub App, and nobody else. Without it,
   steps 3 and 4 block Lovable. With it, Lovable's pushes are the one path
   that reaches `main` unchecked; `Main required gates` still runs on them
   after the push.
6. Verify: open a pull request whose only change breaks a unit test; the
   merge button must be blocked by `Main required gates`. Close it unmerged.

If step 5 is not acceptable, enable only step 2.

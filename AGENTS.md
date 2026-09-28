<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep H.3-E.9.1 evidence collection in server-only/read-only modules and the H.3-E.9 evaluator pure, so diagnostics cannot become an execution path.
- Keep H.3-E.9.1 event writes behind the database-only controlled writer and keep production APP parsing blocked until independent Railway deployed-source parity is proven; an empty ledger cannot prove no execution.
- Keep the H.3-E.9.1-R4 execution-surface inventory server-only and diagnostic; only independently reviewed code and deployed-source parity can promote coverage, because local source inspection cannot establish an authoritative ledger.
- Keep R4.1 execution identities additive and its writer limited to service-side callers with pre-parser fail-closed recording; source preparation alone is not execution authority.
- Keep parser production images on an explicit runtime source allowlist; reference CLI and tests must stay out because their parse entrypoints would evade production ledger coverage.
- Keep the browser parser POC unreachable from production routes and reject production service calls; source and CI checks are preparation, not deployed-bundle proof.
- Keep the H3E91 event bridge authenticated, bounded and database-backed; failed recording must stop parsing, and source-only coverage never establishes deployed parity.
- Treat the R4.1 proof evaluator as pure diagnostic audit-readiness logic, never as DEM or Canonical authorization; even all local proofs cannot substitute deployed-source parity.
- Bind `/v1/parse` retries to the authenticated job/upload/attempt envelope and reconstruct recorder IDs from it; random per-request IDs cannot prove retry idempotency.
- Read H3E91 lifecycle only through the minimal service-role RPC; durable replay must reconcile queue state without rerunning the parser or exposing ledger rows.
- Require committed RAW before FINISHED; compare read-only. R11 stays disposable and fail-closed: probes and claims cannot prove integration; attest independently after the source workflow completes.

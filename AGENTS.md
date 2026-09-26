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
- Keep the H.3-E.9.1 execution ledger sealed without an event writer until separately reviewed execution-path coverage exists, because empty uninstrumented tables cannot prove no execution.
- Keep the H.3-E.9.1-R4 execution-surface inventory server-only and diagnostic; only independently reviewed code and deployed-source parity can promote coverage, because local source inspection cannot establish an authoritative ledger.

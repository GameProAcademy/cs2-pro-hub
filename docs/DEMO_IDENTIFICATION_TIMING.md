# When can the player identify themselves in a demo?

Audit of 2026-11-04 (PR5). The question was whether the "which player are you?" step could be shown
earlier, while the demo is still being analysed.

## Finding: the earliest safe moment is `processed`

- The players offered for selection are the **Canonical participants** (`match_participants`) of
  the demo's match. They exist only after the first pass has persisted the Canonical match. That
  happens at the end of the pipeline (stages `normalizing` → `persisting`).
- `declareDemoPlayer` refuses a job that is still running (`JOB_NOT_EDITABLE`). The choice is applied
  by `requeue_demo_job_after_attachment`, which re-runs the SAME job (retry_count + 1) to compute
  the player's projection. That only makes sense once the first pass has finished.
- Showing nicknames read straight from the parser output (before Canonical persistence) would let
  the player choose an identity that the Canonical resolution may later merge, rename or reject.
  It would also bypass the integrity gates (RAW audit, RAW→Canonical) that run before persistence.

**Conclusion:** the backend dependency stays. The upload modal already asks at the first safe
moment: as soon as the job is `processed`, the modal moves to the selection step without any extra
click. With a Steam match it shows the one-click confirmation. Moving the step earlier would mean
changing the pipeline contract (participants before persistence). That was not done, because it
weakens the gates.

## What PR5 adds instead: a pending selection never disappears

- Pending = `classifyDemoJob(job).category === "identity_pending"`, excluding replaced attempts and
  jobs of an older parser. Those are reprocessed, not identified.
- The pending count is shown on the menu entry and the header upload button, as an amber badge.
- The Dashboard shows a banner listing every pending demo. There are no stacked modals: each entry
  links to `/upload?identify=<jobId>`.
- `/upload?identify=<jobId>` opens the upload modal on that job's selection step, but only while the
  backend still reports the job as pending.
- The history card shows "Aguardando identificação" with the inline selection.
- "Decidir depois" keeps the job aside for the automatic resume, so the player is not nagged. The
  badge, banner and card keep showing it until the backend records the choice.

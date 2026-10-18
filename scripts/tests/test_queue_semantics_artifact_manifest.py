"""Keep every generated disposable queue probe report in the downloadable artifact."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/queue-semantics-probe.yml"
EXPECTED_REPORTS = (
    "queue-semantics-report.json",
    "queue-recovery-report.json",
    "canonical-persistence-report.json",
    "attestation-recorder-report.json",
    "gate-semantics-v2-report.json",
    "rls-two-users-report.json",
    "r5-8-9-report.txt",
    "r5-8-10-report.txt",
)


def test_every_generated_probe_report_is_preserved_in_the_artifact():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    start = workflow.index("      - name: Upload the probe reports")
    end = workflow.index("      - name: Tear down disposable services", start)
    upload_block = workflow[start:end]

    for report in EXPECTED_REPORTS:
        assert report in upload_block, f"generated report is not uploaded: {report}"
        assert workflow.count(report) >= 2, f"report must be generated and uploaded: {report}"

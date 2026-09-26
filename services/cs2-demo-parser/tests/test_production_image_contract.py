"""Source-level image allowlist; CI also inspects the actual Docker image."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = {
    "adapter.py", "app.py", "capability_catalog.py", "demo_integrity.py",
    "errors.py", "forensic_audit.py", "hot_payload.py", "parser.py",
    "raw_artifact.py", "raw_evidence.py", "runtime_evidence.py",
    "settings.py", "worker.py",
}


def test_runtime_image_has_explicit_complete_allowlist():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert not re.search(r"(?m)^COPY\s+\.\s+\.$", dockerfile)
    copies = re.findall(r"(?m)^COPY\s+([^\n]*app\.py[^\n]*)\s+\./$", dockerfile)
    assert len(copies) == 1
    assert set(copies[0].split()) == RUNTIME
    assert "python_reference.py" not in dockerfile.split("COPY requirements.txt ./", 1)[1].split("# Non-root runtime", 1)[0]
    assert all((ROOT / name).is_file() for name in RUNTIME)
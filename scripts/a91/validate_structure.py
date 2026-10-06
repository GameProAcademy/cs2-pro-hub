"""CLI-only structural gate, never imports or invokes the parser."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services/cs2-demo-parser"))
from demo_integrity import validate_demo_structure

if __name__ == "__main__":
    try:
        validate_demo_structure(sys.argv[1])
    except Exception:
        print("A91_DEM_STRUCTURE_INVALID", file=sys.stderr)
        raise SystemExit(1)
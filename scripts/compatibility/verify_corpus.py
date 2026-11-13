#!/usr/bin/env python3
"""Verify local demo files against the PM6 corpus manifest (hash + size), read-only.

    python3 scripts/compatibility/verify_corpus.py docs/reference/compatibility/corpus_manifest.json demo1.dem ...

Prints fixture_id per file, or UNKNOWN when the SHA-256 is not in the manifest. Never opens the
demo with a parser and never uploads anything.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def verify(manifest: dict, paths: list[str]) -> list[dict]:
    by_sha = {fixture["sha256"]: fixture for fixture in manifest.get("fixtures", [])}
    results = []
    for path in paths:
        digest, size = sha256(path), os.path.getsize(path)
        fixture = by_sha.get(digest)
        if fixture is None:
            results.append({"file": os.path.basename(path), "sha256": digest, "status": "UNKNOWN"})
        elif fixture.get("bytes") not in (None, 0, size):
            results.append({"file": os.path.basename(path), "sha256": digest, "status": "SIZE_MISMATCH",
                            "fixture_id": fixture["fixture_id"]})
        else:
            results.append({"file": os.path.basename(path), "sha256": digest, "status": "MATCH",
                            "fixture_id": fixture["fixture_id"]})
    return results


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    manifest = json.load(open(argv[1], encoding="utf-8"))
    results = verify(manifest, argv[2:])
    print(json.dumps(results, indent=1))
    return 0 if all(r["status"] == "MATCH" for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

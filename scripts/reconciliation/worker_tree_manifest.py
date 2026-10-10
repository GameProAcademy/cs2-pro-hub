#!/usr/bin/env python3
"""Read-only manifest of services/cs2-demo-parser across the three worker refs.

Compares git blob ids only. It reads objects that are already in the local
repository (fetch the refs first); it writes nothing to git, contacts no
service and reads no secret. Output is deterministic JSON on stdout.

    git fetch origin infra/cs2-parser-worker-v8 infra/cs2-demo-parser-worker-v8
    python3 scripts/reconciliation/worker_tree_manifest.py > docs/worker-tree-manifest.json
"""
from __future__ import annotations

import json
import subprocess
import sys

TREE = "services/cs2-demo-parser"
REFS = {
    "main": "c433fcc264927ba7e0c8272b1ed89482a3a09128",
    "deployed": "91aeee853200d0f461d0d36af1781d7fdfa40941",
    "contract_pin": "5703b1d88f21ee57fdd1d83722edf30e0f0c6f76",
}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def blobs(commit: str) -> dict[str, str]:
    result = {}
    for line in git("ls-tree", "-r", commit, "--", TREE).splitlines():
        meta, path = line.split("\t", 1)
        result[path[len(TREE) + 1:]] = meta.split()[2]
    return result


def merge_base(left: str, right: str) -> str | None:
    done = subprocess.run(["git", "merge-base", left, right], capture_output=True, text=True, check=False)
    return done.stdout.strip() or None


def main() -> int:
    refs = dict(REFS)
    if len(sys.argv) == 2:
        refs["main"] = git("rev-parse", sys.argv[1]).strip()
    trees = {name: blobs(commit) for name, commit in refs.items()}
    files = {}
    for path in sorted(set().union(*trees.values())):
        ids = {name: trees[name].get(path) for name in refs}
        present = [name for name in refs if ids[name]]
        distinct = {value for value in ids.values() if value}
        files[path] = {
            **ids,
            "state": "IDENTICAL_IN_ALL" if len(present) == 3 and len(distinct) == 1
            else "DIFFERS" if len(present) == 3
            else "ONLY_IN_" + "_AND_".join(name.upper() for name in present),
        }
    pairs = {}
    names = list(refs)
    for index, left in enumerate(names):
        for right in names[index + 1:]:
            ahead, behind = git("rev-list", "--left-right", "--count", f"{refs[left]}...{refs[right]}").split()
            pairs[f"{left}..{right}"] = {
                "merge_base": merge_base(refs[left], refs[right]),
                "only_left": int(ahead),
                "only_right": int(behind),
            }
    summary: dict[str, int] = {}
    for item in files.values():
        summary[item["state"]] = summary.get(item["state"], 0) + 1
    print(json.dumps({"tree": TREE, "refs": refs, "history": pairs, "summary": summary, "files": files},
                     indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""A9.1 controlled large-demo WASM remediation and real-Dem gate."""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import wasm_patches  # noqa: E402


ROOT = pathlib.Path(os.environ["GITHUB_WORKSPACE"])
TMP = pathlib.Path(os.environ.get("RUNNER_TEMP", "/tmp"))
UPSTREAM = TMP / "demoparser-upstream"
WASM_PKG = pathlib.Path(os.environ["A91_WASM_ARTIFACT_DIR"])
MANIFEST = pathlib.Path(os.environ["A91_WASM_MANIFEST"])
UPSTREAM_COMMIT = os.environ["UPSTREAM_COMMIT"]
RUST_VERSION = os.environ["RUST_VERSION"]
WASM_PACK_VERSION = os.environ["WASM_PACK_VERSION"]


DEM_INPUT_ENV_KEYS = (
    "A91_DEMO_URL",
    "EXPECTED_SHA256",
    "EXPECTED_SIZE_BYTES",
    "AUTHORIZATION_REF",
    "DEMO_FILENAME",
    "DEM_SHA256",
    "DEM_SIZE",
    "DEM_AUTH",
)


def child_environment(extra: dict[str, str] | None = None) -> dict[str, str]:
    """Do not leak signed DEM URLs or authorization inputs to build subprocesses."""
    env = os.environ.copy()
    for key in DEM_INPUT_ENV_KEYS:
        env.pop(key, None)
    if extra:
        env.update(extra)
    return env


def run(
    *args: str,
    cwd: pathlib.Path | None = None,
    env: dict[str, str] | None = None,
) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, cwd=cwd, env=child_environment(env), check=True)


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def preflight() -> None:
    # Validate workflow-dispatch metadata normalization and tick discovery before
    # spending time building the pinned WASM toolchain.
    run(sys.executable, "scripts/a91/test_input_metadata.py", cwd=ROOT)
    run(sys.executable, "scripts/a91/test_demo_tick_probe.py", cwd=ROOT)
    run("node", "scripts/a91/wasm_value_normalization.check.mjs", cwd=ROOT)
    run("node", "scripts/a91/header_probe.check.mjs", cwd=ROOT)
    run("node", "scripts/a91/tick_probe.check.mjs", cwd=ROOT)
    run("node", "scripts/a91/inventory_determinism.check.mjs", cwd=ROOT)
    # Canonical parity contract: both implementations must agree on the shared
    # vectors and the comparator must detect every intentional divergence
    # before any toolchain build or real-DEM download is paid for.
    run(sys.executable, "scripts/a91/test_canonical_schema.py", cwd=ROOT)
    run("node", "scripts/a91/canonical_schema.check.mjs", cwd=ROOT)
    run("node", "scripts/a91/cross_runtime.check.mjs", cwd=ROOT)
    run("node", "scripts/a91/wasm_memory.check.mjs", cwd=ROOT)


def build_wasm_artifact() -> None:
    """Build the pinned, patched WASM artifact and its manifest.

    Shared verbatim by the manual real-DEM gate and the automatic
    public-fixture gate so both exercise the same binary.
    """
    shutil.rmtree(UPSTREAM, ignore_errors=True)
    run("git", "clone", "--filter=blob:none", "https://github.com/LaihoE/demoparser.git", str(UPSTREAM))
    run("git", "checkout", "--detach", UPSTREAM_COMMIT, cwd=UPSTREAM)
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=UPSTREAM, text=True, env=child_environment()).strip()
    if actual != UPSTREAM_COMMIT:
        raise RuntimeError(f"upstream identity mismatch: {actual} != {UPSTREAM_COMMIT}")

    # Every source-level change to the pinned upstream lives in wasm_patches.py
    # so the real-DEM gate and the public-fixture gate build the SAME artifact.
    build_remediation = wasm_patches.apply_all(UPSTREAM)

    cargo = UPSTREAM / ".cargo/config.toml"
    cargo.parent.mkdir(parents=True, exist_ok=True)
    cargo.write_text("""[target.wasm32-unknown-unknown]
rustflags = ["-C", "link-arg=-z", "-C", "link-arg=stack-size=8388608"]
""")

    shutil.rmtree(WASM_PKG, ignore_errors=True)
    WASM_PKG.mkdir(parents=True, exist_ok=True)
    run(
        "wasm-pack", "build", "src/wasm", "--target", "no-modules", "--release",
        "--out-dir", str(WASM_PKG), "--mode", "no-install", cwd=UPSTREAM,
    )

    binding = WASM_PKG / "demoparser2.js"
    wasm = WASM_PKG / "demoparser2_bg.wasm"
    if not binding.is_file() or binding.stat().st_size == 0:
        raise RuntimeError("rebuilt demoparser2.js is missing or empty")
    if not wasm.is_file() or wasm.stat().st_size == 0:
        raise RuntimeError("rebuilt demoparser2_bg.wasm is missing or empty")

    manifest_source = ROOT / "public/client-parser/demoparser2/0.42.0/artifact-manifest.json"
    manifest_data = json.loads(manifest_source.read_text())
    manifest_data["status"] = "VERIFIED_UPSTREAM_SOURCE_ARTIFACT_WITH_A91_LARGE_DEM_REMEDIATION"
    manifest_data["sourceTag"] = os.environ["UPSTREAM_TAG"]
    manifest_data["sourceCommit"] = UPSTREAM_COMMIT
    manifest_data["binding"] = {
        "file": "demoparser2.js",
        "bytes": binding.stat().st_size,
        "sha256": sha256(binding),
    }
    manifest_data["wasm"] = {
        "file": "demoparser2_bg.wasm",
        "bytes": wasm.stat().st_size,
        "sha256": sha256(wasm),
    }
    # The checked-in upstream manifest historically described an unpinned
    # reference build. A9.1 is a controlled laboratory build with the source
    # commit and toolchain explicitly pinned by the workflow. Replace that
    # stale PARTIAL declaration so generated evidence describes the build
    # that actually produced the artifact without claiming bit-for-bit
    # reproducibility across arbitrary machines.
    manifest_data["reproducibility"] = {
        "status": "CONTROLLED_BUILD_PINNED",
        "reason": "A9.1 pins the upstream source commit plus Rust, wasm-pack, and wasm-bindgen versions for this controlled runner build.",
        "sourceCommit": UPSTREAM_COMMIT,
        "rustVersion": RUST_VERSION,
        "wasmPackVersion": WASM_PACK_VERSION,
        "wasmBindgenVersion": os.environ["WASM_BINDGEN_VERSION"],
        "matchesUpstreamArtifact": False,
    }
    manifest_data["declaredExports"] = sorted(
        {*manifest_data["declaredExports"], *wasm_patches.ADDED_EXPORTS}
    )
    manifest_data["buildRemediation"] = {
        **build_remediation,
        "rustVersion": RUST_VERSION,
        "wasmPackVersion": WASM_PACK_VERSION,
        "wasmBindgenVersion": os.environ["WASM_BINDGEN_VERSION"],
        "buildMode": "release",
        "target": "wasm32-unknown-unknown",
        "wasmBindgenTarget": "no-modules",
    }
    MANIFEST.write_text(json.dumps(manifest_data, indent=2) + "\n")


def main() -> int:
    preflight()
    build_wasm_artifact()

    # The A9.1 laboratory runner is intentionally independent from the
    # Railway production image. The Python reference still requires the exact
    # demoparser2 0.42.0 wheel, so install it explicitly in the ephemeral
    # runner before execute.py imports the reference module. This is pinned,
    # disposable, and never changes the production Railway environment.
    run(
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "demoparser2==0.42.0",
    )
    verify = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import importlib.metadata as m; "
                "import demoparser2; "
                "from demoparser2 import DemoParser; "
                "assert m.version('demoparser2') == '0.42.0'; "
                "print('A9.1 Python demoparser2 import PASS', demoparser2.__file__)"
            ),
        ],
        cwd=ROOT,
        env=child_environment(),
        check=True,
    )
    if verify.returncode != 0:
        raise RuntimeError("PYTHON_REFERENCE_DEPENDENCY_IMPORT_FAILED")

    # Restore the authorized DEM inputs only for the isolated gate process.
    # All preceding clone/build/package-install children receive a scrubbed env.
    gate_env = child_environment()
    for key in DEM_INPUT_ENV_KEYS:
        if key in os.environ:
            gate_env[key] = os.environ[key]
    gate_env["A91_WASM_ARTIFACT_DIR"] = str(WASM_PKG)
    gate_env["A91_WASM_MANIFEST"] = str(MANIFEST)
    run(sys.executable, "scripts/a91/execute.py", cwd=ROOT, env=gate_env)

    # Never mutate the default branch from a long-running parser/DEM gate.
    # Successful output remains a short-lived evidence artifact; any later
    # browser-WASM promotion must be reviewed and merged as a separate PR.
    print("A9.1 controlled remediation completed successfully.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

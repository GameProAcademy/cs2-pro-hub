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


ROOT = pathlib.Path(os.environ["GITHUB_WORKSPACE"])
TMP = pathlib.Path(os.environ.get("RUNNER_TEMP", "/tmp"))
UPSTREAM = TMP / "demoparser-upstream"
WASM_PKG = pathlib.Path(os.environ["A91_WASM_ARTIFACT_DIR"])
MANIFEST = pathlib.Path(os.environ["A91_WASM_MANIFEST"])
UPSTREAM_COMMIT = os.environ["UPSTREAM_COMMIT"]
RUST_VERSION = os.environ["RUST_VERSION"]
WASM_PACK_VERSION = os.environ["WASM_PACK_VERSION"]


def run(*args: str, cwd: pathlib.Path | None = None) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, cwd=cwd, check=True)


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    shutil.rmtree(UPSTREAM, ignore_errors=True)
    run("git", "clone", "--filter=blob:none", "https://github.com/LaihoE/demoparser.git", str(UPSTREAM))
    run("git", "checkout", "--detach", UPSTREAM_COMMIT, cwd=UPSTREAM)
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=UPSTREAM, text=True).strip()
    if actual != UPSTREAM_COMMIT:
        raise RuntimeError(f"upstream identity mismatch: {actual} != {UPSTREAM_COMMIT}")

    # Hermeticize the pinned upstream build. The generated protobuf/map/message-type
    # sources are already committed at the pinned revision, while upstream's original
    # build scripts redundantly clone GameTracking-CS2 and invoke prost-build/protoc.
    # Keep the generated sources byte-for-byte and replace both generators with no-ops.
    generated_sources = [
        UPSTREAM / "src/csgoproto/src/protobuf.rs",
        UPSTREAM / "src/csgoproto/src/maps.rs",
        UPSTREAM / "src/csgoproto/src/message_type.rs",
    ]
    for generated in generated_sources:
        if not generated.is_file() or generated.stat().st_size == 0:
            raise RuntimeError(f"missing committed generated source: {generated}")

    csgoproto_build = UPSTREAM / "src/csgoproto/build.rs"
    parser_build = UPSTREAM / "src/parser/build.rs"
    csgoproto_build.write_text(
        'fn main() {\n'
        '    println!("cargo::rerun-if-changed=src/protobuf.rs");\n'
        '    println!("cargo::rerun-if-changed=src/maps.rs");\n'
        '    println!("cargo::rerun-if-changed=src/message_type.rs");\n'
        '}\n'
    )
    parser_build.write_text(
        'fn main() {\n'
        '    println!("cargo::rerun-if-changed=../csgoproto/src/protobuf.rs");\n'
        '}\n'
    )

    csgoproto_manifest = UPSTREAM / "src/csgoproto/Cargo.toml"
    cargo_text = csgoproto_manifest.read_text()
    build_deps = '''[build-dependencies]
prost-build = "0.13.3"
'''
    if build_deps not in cargo_text:
        raise RuntimeError("csgoproto prost-build dependency target not found")
    csgoproto_manifest.write_text(cargo_text.replace(build_deps, "", 1))

    # wasm32-unknown-unknown traps on unconditional std::time::Instant::now().
    # Keep upstream profiling behavior on native targets, but make the two
    # parser-entry profiling timestamps lazy exactly as the WASM remediation
    # evidence requires. This is a source-level compatibility patch only;
    # it does not alter parsed DEM data or parser output.
    parse_demo_src = UPSTREAM / "src/parser/src/parse_demo.rs"
    parse_demo = parse_demo_src.read_text()
    old_prof = '''        let _prof = std::env::var("CS2_PROF").is_ok();
        let _t = std::time::Instant::now();
'''
    new_prof = '''        let _prof = std::env::var("CS2_PROF").is_ok();
        let _t = _prof.then(std::time::Instant::now);
'''
    if old_prof not in parse_demo:
        raise RuntimeError("parse_demo first Instant::now target not found")
    parse_demo = parse_demo.replace(old_prof, new_prof, 1)
    old_first_elapsed = '''        if _prof {
            eprintln!("[prof] first_pass: {:.3}s", _t.elapsed().as_secs_f64());
        }
'''
    new_first_elapsed = '''        if _prof {
            eprintln!("[prof] first_pass: {:.3}s", _t.as_ref().expect("profiling timer").elapsed().as_secs_f64());
        }
'''
    if old_first_elapsed not in parse_demo:
        raise RuntimeError("parse_demo first-pass timer target not found")
    parse_demo = parse_demo.replace(old_first_elapsed, new_first_elapsed, 1)

    old_second = '''        let prof = std::env::var("CS2_PROF").is_ok();
        let mut t = std::time::Instant::now();
'''
    new_second = '''        let prof = std::env::var("CS2_PROF").is_ok();
        let mut t = prof.then(std::time::Instant::now);
'''
    if old_second not in parse_demo:
        raise RuntimeError("parse_demo second Instant::now target not found")
    parse_demo = parse_demo.replace(old_second, new_second, 1)

    old_elapsed = '''        if prof { eprintln!("[prof] second_pass start(): {:.3}s", t.elapsed().as_secs_f64()); t = std::time::Instant::now(); }
'''
    new_elapsed = '''        if prof {
            eprintln!("[prof] second_pass start(): {:.3}s", t.as_ref().expect("profiling timer").elapsed().as_secs_f64());
            t = prof.then(std::time::Instant::now);
        }
'''
    if old_elapsed not in parse_demo:
        raise RuntimeError("parse_demo second-pass timer reset target not found")
    parse_demo = parse_demo.replace(old_elapsed, new_elapsed, 1)

    old_create = '''        if prof { eprintln!("[prof] create_output: {:.3}s", t.elapsed().as_secs_f64()); t = std::time::Instant::now(); }
'''
    new_create = '''        if prof {
            eprintln!("[prof] create_output: {:.3}s", t.as_ref().expect("profiling timer").elapsed().as_secs_f64());
            t = prof.then(std::time::Instant::now);
        }
'''
    if old_create not in parse_demo:
        raise RuntimeError("parse_demo create-output timer reset target not found")
    parse_demo = parse_demo.replace(old_create, new_create, 1)

    old_combine = '''        if prof { eprintln!("[prof] combine_outputs: {:.3}s", t.elapsed().as_secs_f64()); t = std::time::Instant::now(); }
'''
    new_combine = '''        if prof {
            eprintln!("[prof] combine_outputs: {:.3}s", t.as_ref().expect("profiling timer").elapsed().as_secs_f64());
            t = prof.then(std::time::Instant::now);
        }
'''
    if old_combine not in parse_demo:
        raise RuntimeError("parse_demo combine-output timer reset target not found")
    parse_demo = parse_demo.replace(old_combine, new_combine, 1)

    old_post = '''        if prof { eprintln!("[prof] post-proc: {:.3}s", t.elapsed().as_secs_f64()); }
'''
    new_post = '''        if prof {
            eprintln!("[prof] post-proc: {:.3}s", t.as_ref().expect("profiling timer").elapsed().as_secs_f64());
        }
'''
    if old_post not in parse_demo:
        raise RuntimeError("parse_demo post-processing timer target not found")
    parse_demo = parse_demo.replace(old_post, new_post, 1)
    parse_demo_src.write_text(parse_demo)

    wasm_src = UPSTREAM / "src/wasm/src/lib.rs"
    source = wasm_src.read_text()
    old = """    let output = parser.parse_header_only(&file).unwrap();
    let mut hm: HashMap<String, String> = HashMap::default();
    hm.extend(output);
"""
    new = """    let output = match parser.parse_header_only(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut hm: HashMap<String, String> = HashMap::default();
    hm.extend(output);
"""
    if old not in source:
        raise RuntimeError("parseHeader unwrap target not found")
    source = source.replace(old, new, 1)

    old_flag = "        parse_projectiles: true,\n        only_header: true,"
    new_flag = "        parse_projectiles: false,\n        only_header: true,"
    if old_flag not in source:
        raise RuntimeError("parseHeader parse_projectiles target not found")
    source = source.replace(old_flag, new_flag, 1)
    wasm_src.write_text(source)

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
    manifest_data["buildRemediation"] = {
        "parseHeaderErrorPropagation": True,
        "parseHeaderParseProjectiles": False,
        "lazyWasmInstantProfiling": True,
        "wasmStackBytes": 8388608,
        "hermeticGeneratedSources": True,
        "hermeticBuildScripts": True,
        "protocRequired": False,
        "gametrackingNetworkRequired": False,
        "rustVersion": RUST_VERSION,
        "wasmPackVersion": WASM_PACK_VERSION,
        "buildMode": "release",
        "target": "wasm32-unknown-unknown",
        "wasmBindgenTarget": "no-modules",
    }
    MANIFEST.write_text(json.dumps(manifest_data, indent=2) + "\n")

    env = os.environ.copy()
    env["A91_WASM_ARTIFACT_DIR"] = str(WASM_PKG)
    env["A91_WASM_MANIFEST"] = str(MANIFEST)
    run(sys.executable, "scripts/a91/execute.py", cwd=ROOT)

    if os.environ.get("INPUT_PROMOTE_ON_PASS", "true").lower() == "true":
        target = ROOT / "public/client-parser/demoparser2/0.42.0"
        shutil.copy2(binding, target / "demoparser2.js")
        shutil.copy2(wasm, target / "demoparser2_bg.wasm")
        shutil.copy2(MANIFEST, target / "artifact-manifest.json")
        run("git", "config", "user.name", "github-actions[bot]", cwd=ROOT)
        run("git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", cwd=ROOT)
        run("git", "add", str(target / "demoparser2.js"), str(target / "demoparser2_bg.wasm"), str(target / "artifact-manifest.json"), cwd=ROOT)
        staged = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
        if staged.returncode != 0:
            run("git", "commit", "-m", "fix(a91): promote large-demo WASM remediation after real gate", cwd=ROOT)
            run("git", "push", cwd=ROOT)

    print("A9.1 controlled remediation completed successfully.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

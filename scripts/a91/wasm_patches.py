#!/usr/bin/env python3
"""Source patches applied to the pinned upstream demoparser before the A9.1 WASM build.

Every patch is exact-match and fail-closed: if the pinned upstream text is not
found, the build stops. Nothing here changes what the parser decodes from a
DEM. The module is shared by the manual real-DEM gate
(rebuild_wasm_large_demo.py) and the automatic public-fixture gate
(public_fixture_gate.py) so both run the same artifact recipe.
"""
from __future__ import annotations

import pathlib

# Stage ids written by a91_mark() and read back through a91MemoryProbe().
PROBE_STAGES = {
    0: "not_entered",
    1: "entered_input_copied",
    2: "parsed_columns_built",
    4: "rows_materialized",
    5: "serialized_to_js",
}

A91_RUST_BLOCK = r'''

// ---------------------------------------------------------------------------
// A9.1 laboratory additions (appended by scripts/a91/wasm_patches.py).
// They do not change what the parser decodes; they add (1) a memory/stage
// probe that survives a trap, (2) a column-major grenade export that skips
// the per-row HashMap materialization, and (3) a synthetic table generator
// used to reproduce memory behaviour without any DEM.
// ---------------------------------------------------------------------------
use parser::first_pass::prop_controller::{
    PropInfo, ENTITY_ID_ID, GRENADE_TYPE_ID, GRENADE_X, GRENADE_Y, GRENADE_Z, NAME_ID, STEAMID_ID, TICK_ID,
};
use parser::second_pass::collect_data::PropType;
use parser::second_pass::variants::{PropColumn, Variant};
use std::sync::atomic::{AtomicU32, Ordering};

static A91_STAGE: AtomicU32 = AtomicU32::new(0);
static A91_ROWS: AtomicU32 = AtomicU32::new(0);
static A91_PAGES: [AtomicU32; 6] = [
    AtomicU32::new(0), AtomicU32::new(0), AtomicU32::new(0),
    AtomicU32::new(0), AtomicU32::new(0), AtomicU32::new(0),
];

fn a91_pages() -> u32 {
    #[cfg(target_arch = "wasm32")]
    {
        return core::arch::wasm32::memory_size(0) as u32;
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        return 0;
    }
}

fn a91_mark(stage: u32) {
    A91_STAGE.store(stage, Ordering::Relaxed);
    A91_PAGES[stage as usize].store(a91_pages(), Ordering::Relaxed);
}

fn a91_rows<S: std::hash::BuildHasher>(columns: &std::collections::HashMap<u32, PropColumn, S>) {
    let rows = columns.values().map(|column| column.len()).max().unwrap_or(0);
    A91_ROWS.store(rows as u32, Ordering::Relaxed);
}

/// [last stage reached, rows, pages now, pages at stage 1, 2, 4, 5].
/// One WASM page is 65,536 bytes. Callable after a trap: statics survive.
#[wasm_bindgen]
pub fn a91MemoryProbe() -> Vec<u32> {
    vec![
        A91_STAGE.load(Ordering::Relaxed),
        A91_ROWS.load(Ordering::Relaxed),
        a91_pages(),
        A91_PAGES[1].load(Ordering::Relaxed),
        A91_PAGES[2].load(Ordering::Relaxed),
        A91_PAGES[4].load(Ordering::Relaxed),
        A91_PAGES[5].load(Ordering::Relaxed),
    ]
}

/// Builds a grenade-shaped table of `rows` synthetic rows (same eight columns
/// and value types as collect_projectiles) next to `ballast_bytes` standing in
/// for the DEM copy, then serializes it either row-major (the upstream
/// parseGrenades path: soa_to_aos + to_value) or column-major. No DEM involved.
#[wasm_bindgen]
pub fn a91SyntheticGrenadeTable(rows: u32, ballast_bytes: u32, columns: bool) -> Result<JsValue, JsError> {
    a91_mark(1);
    let ballast: Vec<u8> = vec![1u8; ballast_bytes as usize];
    let names: [(u32, &str); 8] = [
        (GRENADE_TYPE_ID, "grenade_type"), (ENTITY_ID_ID, "grenade_entity_id"),
        (GRENADE_X, "x"), (GRENADE_Y, "y"), (GRENADE_Z, "z"),
        (TICK_ID, "tick"), (STEAMID_ID, "steamid"), (NAME_ID, "name"),
    ];
    let mut prop_infos: Vec<PropInfo> = names
        .iter()
        .map(|(id, name)| PropInfo {
            id: *id,
            prop_type: PropType::Custom,
            prop_name: name.to_string(),
            prop_friendly_name: name.to_string(),
            is_player_prop: true,
        })
        .collect();
    prop_infos.sort_by_key(|x| x.prop_name.clone());
    let mut helper = OutputSerdeHelperStruct { prop_infos, inner: Default::default() };
    const KINDS: [&str; 6] = [
        "CSmokeGrenadeProjectile", "CSmokeGrenade", "CFlashbang", "CHEGrenade", "CMolotovGrenade", "CIncendiaryGrenade",
    ];
    for i in 0..rows {
        let projectile = i % 6 == 0;
        let coordinate = |offset: f32| if projectile { Some(Variant::F32(i as f32 * 0.25 + offset)) } else { None };
        let values: [(u32, Option<Variant>); 8] = [
            (GRENADE_TYPE_ID, Some(Variant::String(KINDS[(i % 6) as usize].to_string()))),
            (ENTITY_ID_ID, Some(Variant::I32((i % 512) as i32))),
            (GRENADE_X, coordinate(0.0)),
            (GRENADE_Y, coordinate(1.5)),
            (GRENADE_Z, coordinate(-3.0)),
            (TICK_ID, Some(Variant::I32((i / 40) as i32))),
            (STEAMID_ID, Some(Variant::U64(76561198000000000u64 + (i % 10) as u64))),
            (NAME_ID, Some(Variant::String(format!("player{}", i % 10)))),
        ];
        for (id, value) in values {
            helper.inner.entry(id).or_insert_with(PropColumn::new).push(value);
        }
    }
    a91_rows(&helper.inner);
    a91_mark(2);
    let value = if columns {
        serde_wasm_bindgen::to_value(&helper)
    } else {
        let result = soa_to_aos(helper);
        a91_mark(4);
        serde_wasm_bindgen::to_value(&result)
    };
    let s = match value {
        Ok(s) => s,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    a91_mark(5);
    drop(ballast);
    Ok(s)
}
'''


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {text.count(old)}")
    return text.replace(old, new, 1)


def apply_base_patches(UPSTREAM: pathlib.Path) -> None:
    """Build hermeticity, wasm32 compatibility and the PR #71 projectile alignment."""
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

    # The pinned Python parse_grenades path enables projectile parsing, while
    # the pinned WASM wrapper hard-codes it off. This changes the semantics of
    # parseGrenades (the real run showed 4,550,843 Python rows vs 2,551,710 WASM
    # rows). Scope the parity remediation to parseGrenades only; do not alter
    # parseEvent, parseTicks or the header-only path.
    grenade_marker = "pub fn parseGrenades("
    grenade_start = source.find(grenade_marker)
    if grenade_start < 0:
        raise RuntimeError("parseGrenades source target not found")
    next_fn_marker = "\n#[wasm_bindgen]\npub fn parseHeader("
    grenade_end = source.find(next_fn_marker, grenade_start)
    if grenade_end < 0:
        raise RuntimeError("parseGrenades function boundary not found")
    grenade_fn = source[grenade_start:grenade_end]
    old_grenade_flag = "        parse_projectiles: false,\n        only_header: false,"
    new_grenade_flag = "        parse_projectiles: true,\n        only_header: false,"
    if grenade_fn.count(old_grenade_flag) != 1:
        raise RuntimeError("parseGrenades projectile parity target not unique")
    grenade_fn = grenade_fn.replace(old_grenade_flag, new_grenade_flag, 1)
    source = source[:grenade_start] + grenade_fn + source[grenade_end:]
    wasm_src.write_text(source)

    cargo = UPSTREAM / ".cargo/config.toml"
    cargo.parent.mkdir(parents=True, exist_ok=True)
    cargo.write_text("""[target.wasm32-unknown-unknown]
rustflags = ["-C", "link-arg=-z", "-C", "link-arg=stack-size=8388608"]
""")



def apply_memory_patches(UPSTREAM: pathlib.Path) -> None:
    """P1: stage/memory probe, column-major grenade export, synthetic table."""
    wasm_src = UPSTREAM / "src/wasm/src/lib.rs"
    source = wasm_src.read_text()
    marker = "pub fn parseGrenades("
    start = source.find(marker)
    boundary = "\n#[wasm_bindgen]\npub fn parseHeader("
    end = source.find(boundary, start)
    if start < 0 or end < 0:
        raise RuntimeError("parseGrenades boundary not found for memory patches")
    grenade_fn = source[start:end]
    if "parse_projectiles: true,\n        only_header: false," not in grenade_fn:
        raise RuntimeError("memory patches require the projectile alignment patch")

    grenade_fn = _replace_once(
        grenade_fn,
        ") -> Result<JsValue, JsError> {\n",
        ") -> Result<JsValue, JsError> {\n    a91_mark(1);\n",
        "parseGrenades entry",
    )
    grenade_fn = _replace_once(
        grenade_fn,
        "    let mut prop_infos = output.prop_controller.prop_infos.clone();\n",
        "    a91_rows(&output.df);\n    a91_mark(2);\n"
        "    let mut prop_infos = output.prop_controller.prop_infos.clone();\n",
        "parseGrenades parsed",
    )
    row_tail = (
        "    let result = soa_to_aos(helper);\n"
        "    let s = match serde_wasm_bindgen::to_value(&result) {\n"
        "        Ok(s) => s,\n"
        "        Err(e) => return Err(JsError::new(&format!(\"{}\", e))),\n"
        "    };\n"
        "    Ok(s)\n"
        "}"
    )
    row_tail_marked = (
        "    let result = soa_to_aos(helper);\n"
        "    a91_mark(4);\n"
        "    let s = match serde_wasm_bindgen::to_value(&result) {\n"
        "        Ok(s) => s,\n"
        "        Err(e) => return Err(JsError::new(&format!(\"{}\", e))),\n"
        "    };\n"
        "    a91_mark(5);\n"
        "    Ok(s)\n"
        "}"
    )
    column_tail = (
        "    // Column-major: one JS array per field. No per-row HashMap, no cloned keys.\n"
        "    let s = match serde_wasm_bindgen::to_value(&helper) {\n"
        "        Ok(s) => s,\n"
        "        Err(e) => return Err(JsError::new(&format!(\"{}\", e))),\n"
        "    };\n"
        "    a91_mark(5);\n"
        "    Ok(s)\n"
        "}"
    )
    marked = _replace_once(grenade_fn, row_tail, row_tail_marked, "parseGrenades row tail")
    columns_fn = _replace_once(grenade_fn, row_tail, column_tail, "parseGrenadesColumns tail")
    columns_fn = _replace_once(
        columns_fn, "pub fn parseGrenades(", "pub fn parseGrenadesColumns(", "parseGrenadesColumns name"
    )
    source = (
        source[:start]
        + marked
        + "\n/// Same ParserInputs and columns as parseGrenades; column-major output.\n#[wasm_bindgen]\n"
        + columns_fn
        + source[end:]
        + A91_RUST_BLOCK
    )
    wasm_src.write_text(source)


def apply_all(UPSTREAM: pathlib.Path) -> dict[str, object]:
    apply_base_patches(UPSTREAM)
    apply_memory_patches(UPSTREAM)
    return {
        "parseHeaderErrorPropagation": True,
        "parseHeaderParseProjectiles": False,
        "parseGrenadesProjectiles": True,
        "parseGrenadesProjectilesReason": "Mirror pinned Python parse_grenades ParserInputs; source-level A9.1 parity remediation.",
        "parseGrenadesColumnsExport": True,
        "memoryStageProbeExport": True,
        "syntheticGrenadeTableExport": True,
        "lazyWasmInstantProfiling": True,
        "wasmStackBytes": 8388608,
        "hermeticGeneratedSources": True,
        "hermeticBuildScripts": True,
        "protocRequired": False,
        "gametrackingNetworkRequired": False,
    }


ADDED_EXPORTS = ("parseGrenadesColumns", "a91MemoryProbe", "a91SyntheticGrenadeTable")

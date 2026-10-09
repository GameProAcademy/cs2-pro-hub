import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPinnedParser } from "./run_wasm_reference.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);

const arg = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`MISSING_ARG:${name}`);
  return process.argv[index + 1];
};

const wasmDir = arg("--wasm-dir");
const manifestPath = arg("--wasm-manifest");

try {
  const surface = JSON.parse(
    readFileSync(resolve(root, "docs/client-parser/upstream-surface-manifest.json"), "utf8"),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { wasmExports } = loadPinnedParser(surface, manifest, wasmDir);

  // Runtime-only smoke: exercise an actual wasm-bindgen allocator export.
  // Do not assume __wbindgen_free exists: wasm-bindgen does not guarantee that
  // this internal helper is exported by every generated artifact. The previous
  // smoke called malloc and then unconditionally called free, which made the
  // smoke itself fail with TypeError even though initSync and the WASM module
  // were healthy. A short-lived CI process may intentionally leak this tiny
  // allocation; the process exits immediately after the smoke.
  let executedExport = null;
  if (typeof wasmExports.__wbindgen_malloc === "function") {
    const ptr = wasmExports.__wbindgen_malloc(16, 8);
    if (!Number.isInteger(ptr) || ptr <= 0) throw new Error("WASM_MALLOC_FAILURE");
    executedExport = "__wbindgen_malloc";
  } else if (typeof wasmExports.__wbindgen_skip_interpret_calls === "function") {
    wasmExports.__wbindgen_skip_interpret_calls();
    executedExport = "__wbindgen_skip_interpret_calls";
  } else {
    throw new Error("WASM_EXECUTABLE_EXPORT_MISSING");
  }

  process.stdout.write(
    JSON.stringify({
      status: "SUCCEEDED",
      stage: "runtime_smoke",
      parserVersion: manifest.sourceTag,
      parserRevision: manifest.sourceCommit,
      executedExport,
      wasmMemoryBytes: wasmExports.memory?.buffer?.byteLength ?? null,
    }) + "\n",
  );
} catch (error) {
  const message = error?.message || String(error);
  if (/RuntimeError|wasm trap|unreachable|out of bounds/i.test(message)) {
    process.stderr.write("WASM_RUNTIME_TRAP\n");
  } else if (/allocation|out of memory|memory grow|cannot allocate|malloc/i.test(message)) {
    process.stderr.write("WASM_MEMORY_ALLOCATION_FAILURE\n");
  } else {
    process.stderr.write(message + "\n");
  }
  process.exitCode = 1;
}

export {};

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

  // This is deliberately a binary/runtime smoke, not a real-demo parse.
  // demoparser2's parseHeader(only_header=true) still performs a full parser
  // pass, so using the 474 MB authorized DEM here would duplicate one of the
  // actual A9.1 WASM runs and can turn a cheap build smoke into a resource
  // failure. The real parser execution is covered immediately afterward by
  // WASM #1 and WASM #2.
  let executedExport = null;
  if (typeof wasmExports.__wbindgen_skip_interpret_calls === "function") {
    wasmExports.__wbindgen_skip_interpret_calls();
    executedExport = "__wbindgen_skip_interpret_calls";
  } else if (
    typeof wasmExports.__wbindgen_malloc === "function" &&
    typeof wasmExports.__wbindgen_free === "function"
  ) {
    const ptr = wasmExports.__wbindgen_malloc(16, 8);
    if (!ptr) throw new Error("WASM_MALLOC_FAILURE");
    wasmExports.__wbindgen_free(ptr, 16, 8);
    executedExport = "__wbindgen_malloc/__wbindgen_free";
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
  if (/RuntimeError|wasm trap|unreachable|out of bounds/i.test(message))
    process.stderr.write("WASM_RUNTIME_TRAP\n");
  else if (/allocation|out of memory|memory grow|cannot allocate|malloc/i.test(message))
    process.stderr.write("WASM_MEMORY_ALLOCATION_FAILURE\n");
  else
    process.stderr.write(message + "\n");
  process.exitCode = 1;
}

export {};

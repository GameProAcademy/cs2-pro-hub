import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateDemo } from "./contracts.mjs";
import { loadPinnedParser } from "./run_wasm_reference.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);

const arg = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`MISSING_ARG:${name}`);
  return process.argv[index + 1];
};

const demo = arg("--demo");
const authorizationPath = arg("--authorization");
const wasmDir = arg("--wasm-dir");
const manifestPath = arg("--wasm-manifest");

try {
  const authorization = JSON.parse(readFileSync(authorizationPath, "utf8"));
  const bytes = validateDemo(demo, authorization);
  const surface = JSON.parse(
    readFileSync(resolve(root, "docs/client-parser/upstream-surface-manifest.json"), "utf8"),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { parser, wasmExports } = loadPinnedParser(surface, manifest, wasmDir);

  const PAGE_BYTES = 64 * 1024;
  const targetBytes = Math.max(768 * 1024 * 1024, bytes.length + 256 * 1024 * 1024);
  const targetPages = Math.ceil(targetBytes / PAGE_BYTES);
  const currentPages = wasmExports.memory.buffer.byteLength / PAGE_BYTES;
  if (currentPages < targetPages) wasmExports.memory.grow(targetPages - currentPages);
  if (wasmExports.memory.buffer.byteLength < bytes.length)
    throw new Error("WASM_MEMORY_ALLOCATION_FAILURE");

  const header = parser.parseHeader(bytes);
  if (!header || typeof header !== "object")
    throw new Error("WASM_PARSE_FAILURE");

  process.stdout.write(
    JSON.stringify({
      status: "SUCCEEDED",
      stage: "parse_header",
      demoSizeBytes: bytes.length,
      parserVersion: manifest.sourceTag,
      parserRevision: manifest.sourceCommit,
      headerKeys: Object.keys(header).sort(),
    }) + "\n",
  );
} catch (error) {
  const message = error?.message || String(error);
  if (/RuntimeError|wasm trap|unreachable|out of bounds/i.test(message))
    process.stderr.write("WASM_RUNTIME_TRAP\n");
  else if (/allocation|out of memory|memory grow|cannot allocate/i.test(message))
    process.stderr.write("WASM_MEMORY_ALLOCATION_FAILURE\n");
  else
    process.stderr.write(message + "\n");
  process.exitCode = 1;
}

export {};

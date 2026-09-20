import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const REPOSITORY = "https://github.com/LaihoE/demoparser";
const SOURCE_COMMIT = "d3767705dc5846d73ed29db50eaeda58778dc934";
const SOURCE_TAG = "v0.42.0";
const TARGET = "no-modules";
const EXPECTED_EXPORTS = ["parseHeader", "listGameEvents", "parseEvent", "parseTicks"];

const source = resolve(process.env["DEMOPARSER2_SOURCE_DIR"] ?? "/tmp/demoparser-v0.42.0");
const output = resolve(process.env["DEMOPARSER2_OUTPUT_DIR"] ?? "/tmp/demoparser2-wasm-0.42.0");
const crate = resolve(source, "src/wasm");
const generated = resolve(crate, "www/pkg");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function version(command, args = ["--version"]) {
  try {
    return run(command, args);
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(JSON.stringify({ status: "BLOCKED", reason: message }, null, 2));
  process.exit(1);
}

if (!existsSync(resolve(crate, "Cargo.lock")) || !existsSync(resolve(crate, "Cargo.toml"))) {
  fail(`source_missing: clone ${REPOSITORY} at ${SOURCE_COMMIT} into ${source}`);
}
if (existsSync(resolve(source, ".git"))) {
  const commit = run("git", ["rev-parse", "HEAD"], { cwd: source });
  const tagCommit = run("git", ["rev-list", "-n", "1", SOURCE_TAG], { cwd: source });
  if (commit !== SOURCE_COMMIT || tagCommit !== SOURCE_COMMIT) fail("source_identity_mismatch");
}

const tools = {
  rustc: version("rustc"),
  cargo: version("cargo"),
  wasmPack: version("wasm-pack"),
  protoc: version("protoc"),
};
if (Object.values(tools).some((value) => value === null)) fail("required_build_tool_unavailable");

rmSync(generated, { recursive: true, force: true });
mkdirSync(generated, { recursive: true });
try {
  run("wasm-pack", ["build", "--locked", "--release", "--out-dir", "www/pkg", "--target", TARGET], {
    cwd: crate,
  });
} catch (error) {
  fail(`build_failed:${error instanceof Error ? error.message.slice(0, 240) : "unknown"}`);
}

const binding = resolve(generated, "demoparser2.js");
const wasm = resolve(generated, "demoparser2_bg.wasm");
if (!existsSync(binding) || !existsSync(wasm)) fail("binding_or_wasm_missing");
const bindingText = readFileSync(binding, "utf8");
for (const name of EXPECTED_EXPORTS) {
  if (!bindingText.includes(`__exports.${name}`)) fail(`required_export_missing:${name}`);
}
mkdirSync(output, { recursive: true });
copyFileSync(binding, resolve(output, "demoparser2.js"));
copyFileSync(wasm, resolve(output, "demoparser2_bg.wasm"));

console.log(
  JSON.stringify(
    {
      status: "BUILT_NOT_PROVEN_REPRODUCIBLE",
      sourceRepository: REPOSITORY,
      sourceTag: SOURCE_TAG,
      sourceCommit: SOURCE_COMMIT,
      target: "wasm32-unknown-unknown",
      wasmBindgenTarget: TARGET,
      command: "wasm-pack build --locked --release --out-dir www/pkg --target no-modules",
      tools,
      binding: { bytes: statSync(binding).size, sha256: sha256(binding) },
      wasm: { bytes: statSync(wasm).size, sha256: sha256(wasm) },
      reason:
        "upstream Rust and wasm-pack versions are not pinned; compare separately with the checked-in source artifact",
    },
    null,
    2,
  ),
);

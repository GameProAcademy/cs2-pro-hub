import fs from "node:fs";
import path from "node:path";

const roots = [".output", "dist"].filter((candidate) => fs.existsSync(candidate));
if (roots.length === 0) throw new Error("H3E91_BROWSER_BUILD_OUTPUT_MISSING");

const forbidden = [
  "gamepro-client-parser-poc",
  "clientParser.worker",
  "CLIENT_DEM_PARSER_WASM_BINARY_URL",
];
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:js|mjs|cjs|html)$/.test(entry.name)) files.push(target);
  }
};
roots.forEach(walk);

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const marker = forbidden.find((candidate) => source.includes(candidate));
  if (marker) throw new Error(`H3E91_BROWSER_PARSER_IN_PRODUCTION_BUILD:${marker}:${file}`);
}

console.log(`H3E91_BROWSER_PARSER_SEALED:${files.length}`);

import fs from "node:fs";

const viteConfig = fs.readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const supabaseClient = fs.readFileSync(
  new URL("../src/integrations/supabase/client.ts", import.meta.url),
  "utf8",
);

const requiredViteContracts = [
  [/process\.env\s*\[\s*["']VITE_SUPABASE_URL["']\s*\]/, "process VITE_SUPABASE_URL"],
  [
    /process\.env\s*\[\s*["']VITE_SUPABASE_PUBLISHABLE_KEY["']\s*\]/,
    "process VITE_SUPABASE_PUBLISHABLE_KEY",
  ],
  [/process\.env\s*\[\s*["']SUPABASE_URL["']\s*\]/, "process SUPABASE_URL"],
  [/process\.env\s*\[\s*["']SUPABASE_PUBLISHABLE_KEY["']\s*\]/, "process SUPABASE_PUBLISHABLE_KEY"],
  [/import\.meta\.env\.VITE_SUPABASE_URL/, "defined VITE_SUPABASE_URL"],
  [/import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/, "defined VITE_SUPABASE_PUBLISHABLE_KEY"],
];

for (const [pattern, contract] of requiredViteContracts) {
  if (!pattern.test(viteConfig)) {
    throw new Error(`PUBLIC_BUILD_CONFIG_REGRESSION: missing ${contract}`);
  }
}

if (!/\bdefine\s*:/.test(viteConfig)) {
  throw new Error("PUBLIC_BUILD_CONFIG_REGRESSION: Vite public env bridge was removed");
}

const clientUrlFallback =
  /import\.meta\.env\s*\[\s*["']VITE_SUPABASE_URL["']\s*\]\s*\|\|\s*process\.env\s*\[\s*["']SUPABASE_URL["']\s*\]/;
const clientKeyFallback =
  /import\.meta\.env\s*\[\s*["']VITE_SUPABASE_PUBLISHABLE_KEY["']\s*\]\s*\|\|\s*process\.env\s*\[\s*["']SUPABASE_PUBLISHABLE_KEY["']\s*\]/;

if (!clientUrlFallback.test(supabaseClient)) {
  throw new Error("PUBLIC_BUILD_CONFIG_REGRESSION: Supabase URL fallback contract was removed");
}

if (!clientKeyFallback.test(supabaseClient)) {
  throw new Error(
    "PUBLIC_BUILD_CONFIG_REGRESSION: Supabase publishable-key fallback contract was removed",
  );
}

if (!/Missing Supabase environment variable\(s\)/.test(supabaseClient)) {
  throw new Error("PUBLIC_BUILD_CONFIG_REGRESSION: fail-closed client initialization was removed");
}

console.log("PUBLIC_BUILD_CONFIG_OK");

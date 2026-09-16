import fs from "node:fs";

const viteConfig = fs.readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const supabaseClient = fs.readFileSync(new URL("../src/integrations/supabase/client.ts", import.meta.url), "utf8");

const requiredViteContracts = [
  'process.env["VITE_SUPABASE_URL"]',
  'process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]',
  'process.env["SUPABASE_URL"]',
  'process.env["SUPABASE_PUBLISHABLE_KEY"]',
  'import.meta.env.VITE_SUPABASE_URL',
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY',
  'import.meta.env.SUPABASE_URL',
  'import.meta.env.SUPABASE_PUBLISHABLE_KEY',
];

for (const contract of requiredViteContracts) {
  if (!viteConfig.includes(contract)) {
    throw new Error(`PUBLIC_BUILD_CONFIG_REGRESSION: missing ${contract}`);
  }
}

if (!viteConfig.includes("define:")) {
  throw new Error("PUBLIC_BUILD_CONFIG_REGRESSION: Vite public env bridge was removed");
}

if (!supabaseClient.includes("VITE_SUPABASE_URL || SUPABASE_URL")) {
  throw new Error("PUBLIC_BUILD_CONFIG_REGRESSION: Supabase URL fallback contract was removed");
}

if (!supabaseClient.includes("VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY")) {
  throw new Error("PUBLIC_BUILD_CONFIG_REGRESSION: Supabase publishable-key fallback contract was removed");
}

console.log("PUBLIC_BUILD_CONFIG_OK");

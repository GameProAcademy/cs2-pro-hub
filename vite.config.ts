// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "normalize-managed-client-env-access",
        enforce: "pre",
        transform(code, id) {
          const filePath = id.split("?", 1)[0]?.replaceAll("\\", "/");
          if (!filePath?.endsWith("/src/integrations/supabase/client.ts")) return null;

          // Vite statically injects public variables through dot access. The
          // generated client intentionally uses bracket access, which otherwise
          // survives the production build as an empty import.meta.env object.
          return code
            .replaceAll(
              'import.meta.env["VITE_SUPABASE_URL"]',
              "import.meta.env.VITE_SUPABASE_URL",
            )
            .replaceAll(
              'import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]',
              "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
            );
        },
      },
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

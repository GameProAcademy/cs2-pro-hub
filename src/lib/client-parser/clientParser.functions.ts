import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const verifyClientParserResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }) => {
    if (process.env["VITE_CLIENT_DEM_PARSER_POC_ENABLED"] !== "true") {
      return {
        accepted: false,
        canonicalAdmission: "BLOCKED" as const,
        persisted: false as const,
        reasonCode: "CLIENT_PARSER_UNAVAILABLE" as const,
      };
    }
    const { validateClientParserResult } = await import("./clientParser.validator.server");
    return validateClientParserResult(data);
  });

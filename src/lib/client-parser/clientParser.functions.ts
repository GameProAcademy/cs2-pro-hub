import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const verifyClientParserResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { validateClientParserResult } = await import("./clientParser.validator.server");
    return validateClientParserResult(data);
  });

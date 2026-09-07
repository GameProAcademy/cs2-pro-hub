import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getAdminSessionProbe, type AdminSession } from "@/lib/admin.functions";

/**
 * Server-verified administrative session, used ONLY for UI affordances — every
 * administrative operation re-checks authorisation on the server before
 * touching data.
 *
 * The probe is only issued when the browser actually holds a session, so a
 * signed-out shell never fires an unauthenticated server call, and a plain
 * player receives `null` instead of a failed request.
 */
export function useAdminSession() {
  return useQuery<AdminSession | null>({
    queryKey: ["admin", "session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return null;
      return await getAdminSessionProbe();
    },
    staleTime: 60_000,
    retry: false,
  });
}

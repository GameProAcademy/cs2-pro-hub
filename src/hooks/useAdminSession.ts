import { useQuery } from "@tanstack/react-query";

import { getAdminSession, type AdminSession } from "@/lib/admin.functions";

/**
 * Server-verified administrative session. The result is only used for UI
 * affordances — every administrative operation re-checks authorisation on the
 * server before touching data.
 */
export function useAdminSession() {
  return useQuery<AdminSession | null>({
    queryKey: ["admin", "session"],
    queryFn: async () => {
      try {
        return await getAdminSession();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

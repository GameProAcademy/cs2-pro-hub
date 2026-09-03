import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getAdminSession } from "@/lib/admin.functions";

/**
 * Administrative gate. Authorisation is resolved server-side (session +
 * profile + authoritative role) and is fail-closed: any failure redirects the
 * user back to the normal product area.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      const session = await getAdminSession();
      if (!session?.userId) throw new Error("forbidden");
      return { adminSession: session };
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});

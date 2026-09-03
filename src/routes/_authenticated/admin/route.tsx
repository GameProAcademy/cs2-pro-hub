import { Outlet, createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { ErrorState } from "@/components/common/States";
import { getAdminSession } from "@/lib/admin.functions";

/**
 * Administrative gate. Authorisation is resolved server-side (session +
 * profile + authoritative `admin_master` role) and is fail-closed.
 *
 * Two failure modes are handled explicitly so the area can never render a
 * blank screen:
 *  - unauthorised (no administrative role) -> redirect to /dashboard;
 *  - unexpected failure -> controlled error state through `errorComponent`.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    let session: Awaited<ReturnType<typeof getAdminSession>> | null = null;

    try {
      session = await getAdminSession();
    } catch (error) {
      if (isRedirect(error)) throw error;
      // Authorisation could not be confirmed: treat as not authorised and send
      // the user back to the product area. No internal detail is surfaced.
      console.warn("[admin] authorisation could not be confirmed");
      throw redirect({ to: "/dashboard" });
    }

    if (!session?.userId) throw redirect({ to: "/dashboard" });
    return { adminSession: session };
  },
  errorComponent: () => (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <ErrorState title="Admin" description="" />
    </div>
  ),
  component: () => <Outlet />,
});
